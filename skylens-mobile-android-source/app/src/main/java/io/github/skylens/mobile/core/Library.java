package io.github.skylens.mobile.core;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 地图库：快照数据放在 maps/&lt;id&gt;/，元数据放在 meta/&lt;id&gt;.properties。
 * 没有单独的索引文件，所以不会出现“索引和文件对不上”的情况。
 */
public final class Library {
    public static final Pattern ID = Pattern.compile("^[0-9a-f]{16}$");

    private final File base;
    private final File maps;
    private final File meta;
    private final File staging;

    public Library(File base) {
        this.base = base;
        this.maps = new File(base, "maps");
        this.meta = new File(base, "meta");
        this.staging = new File(base, "staging");
    }

    public File baseDir() { return base; }

    /** 创建目录，并清理上次异常退出遗留的临时文件。 */
    public synchronized void init() throws IOException {
        for (File dir : new File[]{maps, meta}) {
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("无法创建目录：" + dir);
        }
        Files.deleteRecursive(staging);
        if (!staging.mkdirs()) throw new IOException("无法创建目录：" + staging);
    }

    public File newStagingDir() {
        return new File(staging, UUID.randomUUID().toString().replace("-", "").substring(0, 12));
    }

    public long freeSpace() {
        base.mkdirs();
        return base.getUsableSpace();
    }

    public File dataDir(String id) {
        if (id == null || !ID.matcher(id).matches()) throw new IllegalArgumentException("无效的地图 ID");
        return new File(maps, id);
    }

    public synchronized List<MapEntry> list() {
        List<MapEntry> result = new ArrayList<>();
        File[] files = meta.listFiles();
        if (files != null) {
            for (File file : files) {
                String name = file.getName();
                if (!name.endsWith(".properties")) continue;
                String id = name.substring(0, name.length() - ".properties".length());
                if (!ID.matcher(id).matches()) continue;
                if (!new File(dataDir(id), "manifest.json").isFile()) continue;
                MapEntry entry = readEntry(id, file);
                if (entry != null) result.add(entry);
            }
        }
        Collections.sort(result, new Comparator<MapEntry>() {
            @Override public int compare(MapEntry a, MapEntry b) {
                return Long.compare(b.importedAtMillis, a.importedAtMillis);
            }
        });
        return result;
    }

    public synchronized MapEntry get(String id) {
        for (MapEntry entry : list()) if (entry.id.equals(id)) return entry;
        return null;
    }

    /** 把整理好的快照目录放入地图库；同一个 ID 会被替换。 */
    public synchronized void install(File stageDir, MapEntry entry) throws IOException {
        File target = dataDir(entry.id);
        Files.deleteRecursive(target);
        if (!stageDir.renameTo(target)) throw new IOException("无法把快照移动到地图库：" + target);
        writeEntry(entry);
    }

    public synchronized MapEntry rename(String id, String name) throws IOException {
        String clean = name == null ? "" : name.trim();
        if (clean.length() > 80) clean = clean.substring(0, 80);
        if (clean.isEmpty()) throw new ImportException("名称不能为空");
        MapEntry entry = get(id);
        if (entry == null) throw new ImportException("找不到这张地图");
        MapEntry renamed = entry.withName(clean);
        writeEntry(renamed);
        return renamed;
    }

    public synchronized void remove(String id) throws IOException {
        Files.deleteRecursive(dataDir(id));
        File file = metaFile(id);
        if (file.exists() && !file.delete()) throw new IOException("无法删除：" + file);
    }

    // ------------------------------------------------------------ 元数据读写

    private File metaFile(String id) {
        return new File(meta, id + ".properties");
    }

    private void writeEntry(MapEntry entry) throws IOException {
        Properties props = new Properties();
        props.setProperty("name", entry.name);
        props.setProperty("source", entry.source == null ? "" : entry.source);
        props.setProperty("importedAt", Long.toString(entry.importedAtMillis));
        props.setProperty("bytes", Long.toString(entry.bytes));
        props.setProperty("buildings", Integer.toString(entry.buildings));
        props.setProperty("roads", Integer.toString(entry.roads));
        props.setProperty("pois", Integer.toString(entry.pois));
        props.setProperty("routes", Integer.toString(entry.routes));
        File tmp = new File(meta, entry.id + ".tmp");
        try (Writer writer = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            props.store(writer, null);
        }
        File target = metaFile(entry.id);
        if (target.exists() && !target.delete()) throw new IOException("无法更新：" + target);
        if (!tmp.renameTo(target)) throw new IOException("无法写入：" + target);
    }

    private MapEntry readEntry(String id, File file) {
        Properties props = new Properties();
        try (Reader reader = new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8)) {
            props.load(reader);
        } catch (IOException e) {
            return null;
        }
        return new MapEntry(
                id,
                props.getProperty("name", id),
                props.getProperty("source", ""),
                parseLong(props.getProperty("importedAt"), 0),
                parseLong(props.getProperty("bytes"), 0),
                (int) parseLong(props.getProperty("buildings"), -1),
                (int) parseLong(props.getProperty("roads"), -1),
                (int) parseLong(props.getProperty("pois"), -1),
                (int) parseLong(props.getProperty("routes"), -1));
    }

    private static long parseLong(String value, long fallback) {
        try {
            return value == null ? fallback : Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
