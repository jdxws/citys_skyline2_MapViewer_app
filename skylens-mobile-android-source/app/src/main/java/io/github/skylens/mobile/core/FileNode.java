package io.github.skylens.mobile.core;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** 基于 java.io.File 的 SourceNode。 */
public final class FileNode implements SourceNode {
    public final File file;

    public FileNode(File file) {
        this.file = file;
    }

    @Override public String name() { return file.getName(); }

    @Override public boolean isDirectory() { return file.isDirectory(); }

    @Override public long size() { return file.isFile() ? file.length() : 0; }

    @Override public List<SourceNode> children() throws IOException {
        File[] files = file.listFiles();
        if (files == null) throw new IOException("无法读取文件夹：" + file);
        List<SourceNode> result = new ArrayList<>(files.length);
        for (File child : files) result.add(new FileNode(child));
        return result;
    }

    @Override public InputStream open() throws IOException { return new FileInputStream(file); }
}
