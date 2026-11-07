import io.github.skylens.mobile.core.*;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.zip.*;

/**
 * 核心逻辑自测（不依赖 Android）。用法：
 *   javac -cp <org.json> -d out app/src/main/java/io/github/skylens/mobile/core/*.java tools/CoreSelfTest.java
 *   java -cp out:<org.json 的 jar 或类目录> CoreSelfTest <快照.zip> [web 资源目录]
 * 注意：出入口表生成用到 org.json（Android 自带，电脑上需要自己提供，例如 Maven 的 org.json:json）。
 */
public class CoreSelfTest {
    static int failures = 0;

    static void check(String label, boolean ok, String detail) {
        System.out.println((ok ? "PASS  " : "FAIL  ") + label + (detail.isEmpty() ? "" : "  —  " + detail));
        if (!ok) failures++;
    }

    static void deleteTree(File f) {
        File[] c = f.listFiles();
        if (c != null) for (File x : c) deleteTree(x);
        f.delete();
    }

    static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
        return out.toString("UTF-8");
    }

    static Library newLib() throws IOException {
        Path dir = Files.createTempDirectory("sky-lib");
        Library lib = new Library(dir.toFile());
        lib.init();
        return lib;
    }

    static boolean throwsImport(IOExceptionRunnable r, String contains) {
        try {
            r.run();
            return false;
        } catch (ImportException e) {
            return e.getMessage().contains(contains);
        } catch (Exception e) {
            return false;
        }
    }

    interface IOExceptionRunnable { void run() throws Exception; }

    public static void main(String[] args) throws Exception {
        File zip = new File(args[0]);
        File webDir = new File(args.length > 1 ? args[1] : "app/src/main/assets/web");

        // 1. 导入真实 ZIP
        Library lib = newLib();
        List<String> messages = new ArrayList<>();
        long t0 = System.currentTimeMillis();
        List<MapEntry> entries;
        try (InputStream in = new FileInputStream(zip)) {
            entries = Importer.importZip(in, zip.length(), zip.getName(), lib, new Progress() {
                double last = -2;
                public void update(double f, String m) { if (Math.abs(f - last) >= 0.2 || f >= 1) { last = f; messages.add(String.format("%.0f%% %s", f * 100, m)); } }
                public boolean isCancelled() { return false; }
            });
        }
        MapEntry e = entries.get(0);
        check("ZIP 导入：ID", e.id.equals("c4653fee929a085b"), e.id);
        check("ZIP 导入：统计", e.buildings == 9164 && e.roads == 7628 && e.pois == 5307 && e.routes == 18,
                e.buildings + "/" + e.roads + "/" + e.pois + "/" + e.routes);
        check("ZIP 导入：默认名称（哈希文件名→城市地图…）", e.name.startsWith("城市地图 "), e.name);
        File entranceTable = new File(lib.dataDir(e.id), "GeoJSON/Subway_Station_Entrances.json");
        check("ZIP 导入：补生成了地铁出入口表", entranceTable.isFile() && entranceTable.length() > 1000, Long.toString(entranceTable.length()));
        check("ZIP 导入：大小 = 原始快照 + 出入口表", e.bytes == 379729533L + entranceTable.length(), Long.toString(e.bytes));
        check("ZIP 导入：耗时", true, (System.currentTimeMillis() - t0) + " ms，进度回调 " + messages.size() + " 次，末条 “" + messages.get(messages.size() - 1) + "”");
        check("ZIP 导入：临时目录已清理", new File(lib.baseDir(), "staging").list().length == 0, "");

        // 2. 地图库
        check("Library：list", lib.list().size() == 1 && lib.list().get(0).id.equals(e.id), "");
        lib.rename(e.id, "测试城市 🏙");
        check("Library：重命名（含中文/emoji）", lib.get(e.id).name.equals("测试城市 🏙"), lib.get(e.id).name);
        check("Library：空名称被拒绝", throwsImport(() -> lib.rename(e.id, "   "), "不能为空"), "");
        check("Library：非法 ID 被拒绝", throwsIllegal(() -> lib.dataDir("../../etc")), "");
        try (InputStream in = new FileInputStream(zip)) {
            List<MapEntry> again = Importer.importZip(in, zip.length(), zip.getName(), lib, Progress.NONE);
            check("重复导入保留自定义名称且不产生重复项", again.get(0).name.equals("测试城市 🏙") && lib.list().size() == 1, again.get(0).name);
        }

        // 3. 路由
        MapRouter router = new MapRouter(path -> {
            File f = new File(webDir, path);
            return f.isFile() ? new FileInputStream(f) : null;
        }, lib.dataDir(e.id));
        check("Router：session.json", read(router.resolve("/session.json").stream).equals(
                "{\"snapshotId\":\"c4653fee929a085b\",\"dataRoot\":\"snapshots/c4653fee929a085b/\"}"), "");
        MapRouter.Resource index = router.resolve("/");
        check("Router：首页", index.status == 200 && index.mime.equals("text/html") && read(index.stream).contains("<div id=\"root\">"), "");
        String jsName = new File(webDir, "assets").list((d, n) -> n.endsWith(".js"))[0];
        MapRouter.Resource js = router.resolve("/assets/" + jsName);
        check("Router：JS MIME（模块脚本必须是 text/javascript）", js.status == 200 && js.mime.equals("text/javascript") && "utf-8".equals(js.charset), js.mime);
        js.stream.close();
        MapRouter.Resource zoning = router.resolve("/snapshots/c4653fee929a085b/GeoJSON/Zoning_Boundary.json");
        check("Router：255 MB 数据文件以流返回", zoning.status == 200 && zoning.mime.equals("application/json") && zoning.length == 255391711L, "length=" + zoning.length);
        zoning.stream.close();
        check("Router：水体图 PNG", router.resolve("/snapshots/c4653fee929a085b/water-mask.png").mime.equals("image/png"), "");
        String[] bad = {"/snapshots/c4653fee929a085b/../../meta/c4653fee929a085b.properties", "/snapshots/c4653fee929a085b/../x",
                "/assets/../../../etc/passwd", "/snapshots/0000000000000000/manifest.json", "/nope.js", "/assets\\..\\x"};
        for (String p : bad) {
            int s = router.resolve(p).status;
            check("Router：拒绝 " + p, s == 403 || s == 404, "status " + s);
        }

        // 4. 文件夹导入
        Path work = Files.createTempDirectory("sky-work");
        unzip(zip, work.resolve("snapshotfolder").toFile());
        Library lib2 = newLib();
        List<MapEntry> r2 = Importer.importTree(new FileNode(work.resolve("snapshotfolder").toFile()), "snapshotfolder", lib2, Progress.NONE);
        check("文件夹导入", r2.size() == 1 && r2.get(0).id.equals(e.id) && r2.get(0).name.equals("snapshotfolder"), r2.get(0).name);

        // dist 结构：dist/data/...
        File dist = work.resolve("dist").toFile();
        new File(dist, "data").getParentFile().mkdirs();
        Files.move(work.resolve("snapshotfolder"), dist.toPath().resolve("data"));
        Library lib3 = newLib();
        List<MapEntry> r3 = Importer.importTree(new FileNode(dist), "dist", lib3, Progress.NONE);
        check("dist（data/ 子目录）导入，通用名称被替换", r3.size() == 1 && r3.get(0).name.startsWith("城市地图 "), r3.get(0).name);

        // 5. 原始 exported_files（没有 manifest / water-mask）
        File raw = work.resolve("raw").toFile();
        unzip(zip, raw);
        new File(raw, "manifest.json").delete();
        new File(raw, "water-mask.png").delete();
        check("原始 exported_files 给出明确提示", throwsImport(() -> Importer.importTree(new FileNode(raw), "raw", newLib(), Progress.NONE), "未处理的原始"), "");
        File empty = work.resolve("empty").toFile();
        empty.mkdirs();
        check("无关文件夹给出提示", throwsImport(() -> Importer.importTree(new FileNode(empty), "x", newLib(), Progress.NONE), "没有找到地图快照"), "");

        // 6. 恶意 / 损坏的 ZIP
        File evil = work.resolve("evil.zip").toFile();
        try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(evil))) {
            z.putNextEntry(new ZipEntry("../evil.txt"));
            z.write("x".getBytes());
            z.closeEntry();
        }
        Library lib4 = newLib();
        check("Zip-slip（../）被拒绝", throwsImport(() -> { try (InputStream in = new FileInputStream(evil)) { Importer.importZip(in, evil.length(), "evil.zip", lib4, Progress.NONE); } }, "不安全"), "");
        check("Zip-slip：没有写出目录之外", !new File(lib4.baseDir(), "staging/evil.txt").exists() && !new File(lib4.baseDir(), "evil.txt").exists(), "");
        File junk = work.resolve("junk.zip").toFile();
        Files.write(junk.toPath(), "this is not a zip".getBytes());
        check("非 ZIP 文件给出提示", throwsImport(() -> { try (InputStream in = new FileInputStream(junk)) { Importer.importZip(in, junk.length(), "junk.zip", lib4, Progress.NONE); } }, "不是有效的 ZIP"), "");
        check("失败后不留临时文件", lib4.list().isEmpty() && new File(lib4.baseDir(), "staging").list().length == 0, "");

        // 7. 取消
        Library lib5 = newLib();
        final int[] calls = {0};
        boolean cancelled = false;
        try (InputStream in = new FileInputStream(zip)) {
            Importer.importZip(in, zip.length(), "c.zip", lib5, new Progress() {
                public void update(double f, String m) { calls[0]++; }
                public boolean isCancelled() { return calls[0] >= 3; }
            });
        } catch (ImportCancelledException ex) {
            cancelled = true;
        }
        check("取消 ZIP 导入：抛出取消异常并清理", cancelled && lib5.list().isEmpty() && new File(lib5.baseDir(), "staging").list().length == 0, "");

        // 8. 删除
        lib.remove(e.id);
        check("Library：删除", lib.list().isEmpty() && !lib.dataDir(e.id).exists(), "");

        deleteTree(work.toFile());
        System.out.println(failures == 0 ? "\n全部通过" : "\n失败 " + failures + " 项");
        System.exit(failures == 0 ? 0 : 1);
    }

    static boolean throwsIllegal(IOExceptionRunnable r) {
        try { r.run(); return false; } catch (IllegalArgumentException e) { return true; } catch (Exception e) { return false; }
    }

    static void unzip(File zip, File dest) throws IOException {
        try (ZipInputStream z = new ZipInputStream(new FileInputStream(zip))) {
            ZipEntry en;
            byte[] b = new byte[65536];
            while ((en = z.getNextEntry()) != null) {
                File out = new File(dest, en.getName());
                if (en.isDirectory()) { out.mkdirs(); continue; }
                out.getParentFile().mkdirs();
                try (OutputStream os = new FileOutputStream(out)) { int n; while ((n = z.read(b)) > 0) os.write(b, 0, n); }
            }
        }
    }
}
