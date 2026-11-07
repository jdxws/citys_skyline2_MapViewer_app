package io.github.skylens.mobile.core;

import java.io.File;
import java.io.IOException;

/** 小型文件工具（不依赖 Android）。 */
final class Files {
    private Files() { }

    static void deleteRecursive(File target) throws IOException {
        if (target == null || !target.exists()) return;
        File[] children = target.isDirectory() ? target.listFiles() : null;
        if (children != null) for (File child : children) deleteRecursive(child);
        if (!target.delete() && target.exists()) throw new IOException("无法删除：" + target);
    }

    static long size(File target) {
        if (target.isFile()) return target.length();
        long total = 0;
        File[] children = target.listFiles();
        if (children != null) for (File child : children) total += size(child);
        return total;
    }
}
