package io.github.skylens.mobile.core;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;

/**
 * 导入器：接受快照 .zip，或包含快照的文件夹（快照目录、已构建 dist 里的 data、游戏的 snapshots 目录……），
 * 自动找出其中已经处理好的快照并放入地图库。
 *
 * 注意：手机版不支持“未处理的原始 exported_files”（没有 manifest.json 和 water-mask.png），
 * 那类数据需要先在电脑版里导入整理。
 */
public final class Importer {
    public static final String[] REQUIRED_GEOJSON = {
            "Building_Boundary.json", "Network_Centerline.json", "Area_Boundary.json", "POI_Location.json",
            "Route_Centerline.json", "Zoning_Boundary.json", "Network_Boundary.json",
    };

    private static final Set<String> SKIP_DIRS = new HashSet<>(Arrays.asList(
            "node_modules", "Styles", "GeoJSON", "GeoTIFF", "Shapefile", "assets", "$RECYCLE.BIN", "System Volume Information"));
    private static final Set<String> GENERIC_NAMES = new HashSet<>(Arrays.asList(
            "data", "exported_files", "dist", "snapshots", "export", "exports"));
    private static final Pattern HASH_NAME = Pattern.compile("^[0-9a-fA-F]{16}$");
    private static final Pattern DATASET_ID = Pattern.compile("\"datasetId\"\\s*:\\s*\"([0-9a-f]{16})\"");
    private static final long SPACE_MARGIN = 50L * 1024 * 1024;

    private Importer() { }

    public enum Kind { PREPARED, RAW }

    public static final class Found {
        public final SourceNode node;
        public final Kind kind;

        Found(SourceNode node, Kind kind) {
            this.node = node;
            this.kind = kind;
        }
    }

    // ------------------------------------------------------------ 对外入口

    /**
     * 导入一个 ZIP 压缩包（流式解压，不需要随机访问，所以可以直接读 Android 的 content:// 文件）。
     *
     * @param compressedSize 压缩包大小，用于显示进度；未知时传 0
     */
    public static List<MapEntry> importZip(InputStream in, long compressedSize, String displayName,
                                           Library library, Progress progress) throws IOException {
        File extractDir = library.newStagingDir();
        try {
            extractZip(in, compressedSize, extractDir, Progress.scaled(progress, 0, 0.7));
            List<Found> found = requirePrepared(findSnapshots(new FileNode(extractDir)));
            List<MapEntry> entries = new ArrayList<>();
            for (int i = 0; i < found.size(); i++) {
                if (progress.isCancelled()) throw new ImportCancelledException();
                SourceNode node = found.get(i).node;
                checkPrepared(node);
                File stage = library.newStagingDir();
                try {
                    File dir = ((FileNode) node).file;
                    if (!dir.renameTo(stage)) throw new IOException("无法移动解压后的文件");
                    entries.add(install(library, stage, nameFor(displayName, node, found.size()), displayName));
                } catch (IOException | RuntimeException e) {
                    Files.deleteRecursive(stage);
                    throw e;
                }
                progress.update(0.7 + 0.3 * (i + 1) / found.size(), "正在保存到地图库…");
            }
            progress.update(1, "导入完成");
            return entries;
        } catch (IOException e) {
            throw friendly(e);
        } finally {
            Files.deleteRecursive(extractDir);
        }
    }

    /** 导入一个文件夹（本地目录或 SAF 文档树）。 */
    public static List<MapEntry> importTree(SourceNode root, String displayName,
                                            Library library, Progress progress) throws IOException {
        try {
            progress.update(-1, "正在查找地图快照…");
            List<Found> found = requirePrepared(findSnapshots(root));
            long total = 0;
            for (Found f : found) {
                checkPrepared(f.node);
                total += treeSize(f.node);
            }
            long free = library.freeSpace();
            if (total + SPACE_MARGIN > free) {
                throw new ImportException("存储空间不足：需要约 " + formatBytes(total) + "，当前仅剩 " + formatBytes(free));
            }

            Counter counter = new Counter(total);
            List<MapEntry> entries = new ArrayList<>();
            for (Found f : found) {
                File stage = library.newStagingDir();
                try {
                    copyTree(f.node, stage, counter, progress);
                    entries.add(install(library, stage, nameFor(displayName, f.node, found.size()), displayName));
                } catch (IOException | RuntimeException e) {
                    Files.deleteRecursive(stage);
                    throw e;
                }
            }
            progress.update(1, "导入完成");
            return entries;
        } catch (IOException e) {
            throw friendly(e);
        }
    }

    // ------------------------------------------------------------ 查找与校验

    /** 由浅入深查找快照；同一层找到多个时全部返回。 */
    public static List<Found> findSnapshots(SourceNode root) throws IOException {
        List<SourceNode> level = new ArrayList<>();
        level.add(root);
        int visited = 0;
        for (int depth = 0; depth <= 4 && !level.isEmpty(); depth++) {
            List<Found> found = new ArrayList<>();
            for (SourceNode dir : level) {
                Kind kind = classify(dir);
                if (kind != null) found.add(new Found(dir, kind));
            }
            if (!found.isEmpty()) return found;
            List<SourceNode> next = new ArrayList<>();
            for (SourceNode dir : level) {
                List<SourceNode> children;
                try {
                    children = dir.children();
                } catch (IOException e) {
                    continue;
                }
                for (SourceNode child : children) {
                    String name = child.name();
                    if (!child.isDirectory() || name.startsWith(".") || SKIP_DIRS.contains(name)) continue;
                    if (++visited > 3000) return new ArrayList<>();
                    next.add(child);
                }
            }
            level = next;
        }
        return new ArrayList<>();
    }

    static Kind classify(SourceNode dir) throws IOException {
        if (!dir.isDirectory()) return null;
        SourceNode geo = child(dir, "GeoJSON");
        if (geo == null || !geo.isDirectory() || child(geo, "Building_Boundary.json") == null) return null;
        boolean prepared = child(dir, "manifest.json") != null && child(dir, "water-mask.png") != null;
        return prepared ? Kind.PREPARED : Kind.RAW;
    }

    private static List<Found> requirePrepared(List<Found> found) throws ImportException {
        List<Found> prepared = new ArrayList<>();
        for (Found f : found) if (f.kind == Kind.PREPARED) prepared.add(f);
        if (!prepared.isEmpty()) return prepared;
        if (!found.isEmpty()) {
            throw new ImportException("这是未处理的原始 exported_files（缺少 manifest.json 和 water-mask.png）。"
                    + "请先在电脑版 SKYLENS Desktop 里导入，再把电脑版地图库中的快照文件夹打成 ZIP 传到手机，"
                    + "或直接导入游戏生成的快照（ModsData/CityMap/snapshots）。");
        }
        throw new ImportException("没有找到地图快照。所选内容里需要有 GeoJSON 文件夹，并且同级有 manifest.json 和 water-mask.png。");
    }

    static void checkPrepared(SourceNode dir) throws IOException {
        SourceNode manifest = child(dir, "manifest.json");
        if (manifest == null) throw new ImportException("manifest.json 不存在，快照可能已损坏");
        if (datasetId(readText(manifest, 8 * 1024 * 1024)) == null) {
            throw new ImportException("manifest.json 中没有有效的快照 ID（datasetId）");
        }
        SourceNode geo = child(dir, "GeoJSON");
        Set<String> names = new HashSet<>();
        if (geo != null) for (SourceNode c : geo.children()) names.add(c.name());
        for (String file : REQUIRED_GEOJSON) {
            if (!names.contains(file)) throw new ImportException("快照不完整：缺少 GeoJSON/" + file);
        }
    }

    // ------------------------------------------------------------ 写入地图库

    private static MapEntry install(Library library, File stage, String name, String source) throws IOException {
        try {
            SubwayEntranceBuilder.ensureGenerated(stage);
        } catch (Throwable ignored) {
            // 出入口表只是可选的增强：生成失败（包括内存不足）也不能让整次导入失败，打开地图时会再试一次
        }
        File manifestFile = new File(stage, "manifest.json");
        String manifest = readText(new FileNode(manifestFile), 8 * 1024 * 1024);
        String id = datasetId(manifest);
        if (id == null) throw new ImportException("manifest.json 中没有有效的快照 ID（datasetId）");
        MapEntry entry = new MapEntry(id, name, source, System.currentTimeMillis(), Files.size(stage),
                featureCount(manifest, "Building_Boundary.json"), featureCount(manifest, "Network_Centerline.json"),
                featureCount(manifest, "POI_Location.json"), featureCount(manifest, "Route_Centerline.json"));
        MapEntry previous = library.get(id);
        if (previous != null) entry = entry.withName(previous.name); // 重新导入时保留用户改过的名字
        library.install(stage, entry);
        return entry;
    }

    static String datasetId(String manifestText) {
        Matcher m = DATASET_ID.matcher(manifestText);
        return m.find() ? m.group(1) : null;
    }

    static int featureCount(String manifestText, String file) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(file) + "\"\\s*:\\s*\\{[^{}]*?\"features\"\\s*:\\s*(\\d+)").matcher(manifestText);
        if (!m.find()) return -1;
        try {
            return Integer.parseInt(m.group(1));
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    static String nameFor(String displayName, SourceNode node, int count) {
        String base = displayName == null ? "" : displayName.trim();
        if (base.toLowerCase(Locale.ROOT).endsWith(".zip")) base = base.substring(0, base.length() - 4);
        if (base.isEmpty() || HASH_NAME.matcher(base).matches() || GENERIC_NAMES.contains(base.toLowerCase(Locale.ROOT))) {
            base = "城市地图 " + new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(new Date());
        }
        return count > 1 ? base + " · " + node.name() : base;
    }

    // ------------------------------------------------------------ 解压与复制

    private static final class CountingInputStream extends FilterInputStream {
        long count;

        CountingInputStream(InputStream in) { super(in); }

        @Override public int read() throws IOException {
            int b = super.read();
            if (b >= 0) count++;
            return b;
        }

        @Override public int read(byte[] buffer, int off, int len) throws IOException {
            int n = super.read(buffer, off, len);
            if (n > 0) count += n;
            return n;
        }
    }

    private static final class Throttle {
        private long last;

        boolean ready() {
            long now = System.nanoTime();
            if (now - last < 120_000_000L) return false;
            last = now;
            return true;
        }
    }

    private static void extractZip(InputStream raw, long compressedSize, File dest, Progress progress) throws IOException {
        if (!dest.isDirectory() && !dest.mkdirs()) throw new IOException("无法创建临时目录：" + dest);
        String destCanonical = dest.getCanonicalPath();
        CountingInputStream counting = new CountingInputStream(raw);
        Throttle throttle = new Throttle();
        byte[] buffer = new byte[64 * 1024];
        int entries = 0;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(counting, 64 * 1024), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (progress.isCancelled()) throw new ImportCancelledException();
                entries++;
                String name = entry.getName().replace('\\', '/');
                File out = new File(dest, name);
                String canonical = out.getCanonicalPath();
                if (!canonical.equals(destCanonical) && !canonical.startsWith(destCanonical + File.separator)) {
                    throw new ImportException("压缩包里包含不安全的路径，已拒绝导入");
                }
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("无法创建目录：" + parent);
                try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out), 64 * 1024)) {
                    int n;
                    while ((n = zip.read(buffer)) > 0) {
                        os.write(buffer, 0, n);
                        if (throttle.ready()) {
                            if (progress.isCancelled()) throw new ImportCancelledException();
                            progress.update(compressedSize > 0 ? Math.min(1.0, counting.count / (double) compressedSize) : -1,
                                    "正在解压 " + shortName(name) + " …");
                        }
                    }
                }
            }
        } catch (IllegalArgumentException e) {
            throw new ImportException("压缩包里的文件名编码无法识别，请用 UTF-8 编码重新打包", e);
        } catch (ZipException e) {
            throw new ImportException("压缩包已损坏，或不是有效的 ZIP 文件", e);
        }
        if (entries == 0) throw new ImportException("这不是有效的 ZIP 文件，或者压缩包是空的");
        progress.update(1, "解压完成");
    }

    private static final class Counter {
        final long total;
        long copied;

        Counter(long total) { this.total = Math.max(1, total); }
    }

    private static void copyTree(SourceNode src, File dst, Counter counter, Progress progress) throws IOException {
        if (progress.isCancelled()) throw new ImportCancelledException();
        if (src.isDirectory()) {
            if (!dst.isDirectory() && !dst.mkdirs()) throw new IOException("无法创建目录：" + dst);
            for (SourceNode child : src.children()) {
                copyTree(child, new File(dst, safeName(child.name())), counter, progress);
            }
            return;
        }
        Throttle throttle = new Throttle();
        byte[] buffer = new byte[64 * 1024];
        try (InputStream in = src.open(); OutputStream out = new BufferedOutputStream(new FileOutputStream(dst), 64 * 1024)) {
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                counter.copied += n;
                if (throttle.ready()) {
                    if (progress.isCancelled()) throw new ImportCancelledException();
                    progress.update(Math.min(1.0, counter.copied / (double) counter.total), "正在复制 " + shortName(src.name()) + " …");
                }
            }
        }
        progress.update(Math.min(1.0, counter.copied / (double) counter.total), "正在复制 " + shortName(src.name()) + " …");
    }

    private static String safeName(String name) throws IOException {
        if (name == null || name.isEmpty() || name.equals(".") || name.equals("..") || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) {
            throw new ImportException("文件夹里有无法识别的文件名：" + name);
        }
        return name;
    }

    private static long treeSize(SourceNode node) throws IOException {
        if (!node.isDirectory()) return node.size();
        long total = 0;
        for (SourceNode child : node.children()) total += treeSize(child);
        return total;
    }

    // ------------------------------------------------------------ 杂项

    static SourceNode child(SourceNode dir, String name) throws IOException {
        for (SourceNode c : dir.children()) if (c.name().equals(name)) return c;
        return null;
    }

    private static String readText(SourceNode node, int maxBytes) throws IOException {
        try (InputStream in = node.open()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                if (out.size() > maxBytes) throw new ImportException(node.name() + " 太大，不像是有效的快照清单");
            }
            String text = new String(out.toByteArray(), StandardCharsets.UTF_8);
            return text.startsWith("\uFEFF") ? text.substring(1) : text;
        }
    }

    private static String shortName(String path) {
        int slash = path.lastIndexOf('/');
        return slash >= 0 ? path.substring(slash + 1) : path;
    }

    public static String formatBytes(long bytes) {
        if (bytes >= 1024L * 1024 * 1024) return String.format(Locale.US, "%.2f GB", bytes / (1024.0 * 1024 * 1024));
        return String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024));
    }

    private static IOException friendly(IOException e) {
        if (e instanceof ImportException) return e;
        String message = String.valueOf(e.getMessage());
        if (message.contains("ENOSPC") || message.contains("No space left")) {
            return new ImportException("存储空间不足，请清理手机空间后重试", e);
        }
        return e;
    }
}
