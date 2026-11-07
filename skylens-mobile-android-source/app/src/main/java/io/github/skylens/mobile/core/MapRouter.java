package io.github.skylens.mobile.core;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 把 WebView 发出的请求路径翻译成本地资源，扮演“游戏会话”：
 *   /session.json            → 告诉网页当前快照的 ID 和数据目录
 *   /snapshots/&lt;id&gt;/…        → 地图库里的快照文件
 *   其它                     → 内置的地图网页（APK 的 assets/web）
 * 不含任何 Android 类，可以在电脑上直接测试。
 */
public final class MapRouter {
    /** 内置网页的来源（Android 里是 AssetManager）。找不到时返回 null。 */
    public interface AssetSource {
        InputStream open(String path) throws IOException;
    }

    public static final class Resource {
        public final int status;
        public final String reason;
        public final String mime;
        public final String charset; // 可能为 null
        public final InputStream stream;
        public final long length;     // 未知时为 -1

        Resource(int status, String reason, String mime, String charset, InputStream stream, long length) {
            this.status = status;
            this.reason = reason;
            this.mime = mime;
            this.charset = charset;
            this.stream = stream;
            this.length = length;
        }
    }

    private static final Pattern DATASET_ID = Pattern.compile("\"datasetId\"\\s*:\\s*\"([0-9a-f]{16})\"");
    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("html", "text/html");
        TYPES.put("js", "text/javascript");
        TYPES.put("mjs", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("json", "application/json");
        TYPES.put("png", "image/png");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("tif", "image/tiff");
        TYPES.put("tiff", "image/tiff");
        TYPES.put("qml", "text/xml");
        TYPES.put("txt", "text/plain");
        TYPES.put("woff", "font/woff");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("pbf", "application/x-protobuf");
        TYPES.put("wasm", "application/wasm");
    }

    private final AssetSource assets;
    private final File dataRoot;
    private final String datasetId;
    private final String prefix;
    private final byte[] sessionBody;

    public MapRouter(AssetSource assets, File dataDir) throws IOException {
        this.assets = assets;
        this.dataRoot = dataDir.getCanonicalFile();
        File manifest = new File(dataRoot, "manifest.json");
        byte[] bytes = readAll(manifest);
        Matcher m = DATASET_ID.matcher(new String(bytes, StandardCharsets.UTF_8));
        if (!m.find()) throw new IOException("manifest.json 中没有有效的快照 ID（datasetId）");
        this.datasetId = m.group(1);
        this.prefix = "/snapshots/" + datasetId + "/";
        this.sessionBody = ("{\"snapshotId\":\"" + datasetId + "\",\"dataRoot\":\"snapshots/" + datasetId + "/\"}")
                .getBytes(StandardCharsets.UTF_8);
    }

    public String datasetId() { return datasetId; }

    /** @param path 已解码的 URL 路径，如 "/assets/index.js"。永远不返回 null。 */
    public Resource resolve(String path) {
        try {
            if (path == null || path.isEmpty()) path = "/";
            if (path.indexOf('\0') >= 0 || path.indexOf('\\') >= 0) return error(403, "Forbidden");

            if (path.equals("/session.json")) {
                return new Resource(200, "OK", "application/json", "utf-8", new ByteArrayInputStream(sessionBody), sessionBody.length);
            }
            if (path.startsWith(prefix)) return snapshotFile(path.substring(prefix.length()));
            return assetFile(path);
        } catch (IOException e) {
            return error(404, "Not Found");
        }
    }

    private Resource snapshotFile(String relative) throws IOException {
        File file = new File(dataRoot, relative).getCanonicalFile();
        String root = dataRoot.getPath() + File.separator;
        if (!file.getPath().startsWith(root)) return error(403, "Forbidden");
        if (!file.isFile()) return error(404, "Not Found");
        return typed(file.getName(), new FileInputStream(file), file.length());
    }

    private Resource assetFile(String path) throws IOException {
        String relative = path.startsWith("/") ? path.substring(1) : path;
        if (relative.isEmpty() || relative.endsWith("/")) relative += "index.html";
        for (String segment : relative.split("/")) {
            if (segment.equals("..") || segment.equals(".")) return error(403, "Forbidden");
        }
        InputStream stream = assets.open(relative);
        if (stream == null) return error(404, "Not Found");
        return typed(relative, stream, -1);
    }

    private static Resource typed(String name, InputStream stream, long length) {
        int dot = name.lastIndexOf('.');
        String extension = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        String mime = TYPES.get(extension);
        if (mime == null) return new Resource(200, "OK", "application/octet-stream", null, stream, length);
        boolean text = mime.startsWith("text/") || mime.equals("application/json") || mime.equals("image/svg+xml");
        return new Resource(200, "OK", mime, text ? "utf-8" : null, stream, length);
    }

    public static Resource error(int status, String reason) {
        return new Resource(status, reason, "text/plain", "utf-8", new ByteArrayInputStream(new byte[0]), 0);
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }
}
