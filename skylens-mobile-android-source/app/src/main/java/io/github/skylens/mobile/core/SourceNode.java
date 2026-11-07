package io.github.skylens.mobile.core;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/** 导入来源中的一个文件或文件夹（本地 File，或 Android 存储访问框架里的文档）。 */
public interface SourceNode {
    String name();

    boolean isDirectory();

    /** 文件大小（字节），未知时为 0。 */
    long size();

    List<SourceNode> children() throws IOException;

    InputStream open() throws IOException;
}
