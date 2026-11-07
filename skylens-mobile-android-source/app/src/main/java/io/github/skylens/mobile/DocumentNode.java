package io.github.skylens.mobile;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import io.github.skylens.mobile.core.SourceNode;

/**
 * 通过 Android 存储访问框架（SAF）读取用户选中的文件夹。
 * 只用到系统自带的 DocumentsContract，不依赖任何第三方库。
 */
final class DocumentNode implements SourceNode {
    private final ContentResolver resolver;
    private final Uri treeUri;
    private final String documentId;
    private final String name;
    private final boolean directory;
    private final long size;
    private List<SourceNode> cache;

    private DocumentNode(ContentResolver resolver, Uri treeUri, String documentId, String name, boolean directory, long size) {
        this.resolver = resolver;
        this.treeUri = treeUri;
        this.documentId = documentId;
        this.name = name;
        this.directory = directory;
        this.size = size;
    }

    /** 用户通过“选择文件夹”授权的根目录。 */
    static DocumentNode root(Context context, Uri treeUri) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        String documentId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
        String[] projection = {DocumentsContract.Document.COLUMN_DISPLAY_NAME};
        try (Cursor cursor = resolver.query(documentUri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new FileNotFoundException("无法读取所选文件夹");
            String name = cursor.isNull(0) ? "" : cursor.getString(0);
            return new DocumentNode(resolver, treeUri, documentId, name, true, 0);
        } catch (SecurityException e) {
            throw new IOException("没有权限读取所选文件夹，请重新选择", e);
        }
    }

    @Override public String name() { return name; }

    @Override public boolean isDirectory() { return directory; }

    @Override public long size() { return size; }

    @Override public synchronized List<SourceNode> children() throws IOException {
        if (cache != null) return cache;
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId);
        String[] projection = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
        };
        List<SourceNode> result = new ArrayList<>();
        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) throw new FileNotFoundException("无法列出文件夹内容：" + name);
            while (cursor.moveToNext()) {
                String id = cursor.getString(0);
                String childName = cursor.isNull(1) ? "" : cursor.getString(1);
                String mime = cursor.isNull(2) ? "" : cursor.getString(2);
                long childSize = cursor.isNull(3) ? 0 : cursor.getLong(3);
                boolean dir = DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
                result.add(new DocumentNode(resolver, treeUri, id, childName, dir, childSize));
            }
        } catch (SecurityException e) {
            throw new IOException("没有权限读取所选文件夹，请重新选择", e);
        }
        cache = result;
        return result;
    }

    @Override public InputStream open() throws IOException {
        InputStream in = resolver.openInputStream(DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId));
        if (in == null) throw new FileNotFoundException("无法打开文件：" + name);
        return in;
    }
}
