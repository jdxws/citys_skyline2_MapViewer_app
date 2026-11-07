package io.github.skylens.mobile.core;

/** 用户主动取消导入。 */
public class ImportCancelledException extends ImportException {
    private static final long serialVersionUID = 1L;

    public ImportCancelledException() {
        super("已取消导入");
    }
}
