package io.github.skylens.mobile.core;

import java.io.IOException;

/** 带有可直接展示给用户的中文提示的导入错误。 */
public class ImportException extends IOException {
    private static final long serialVersionUID = 1L;

    public ImportException(String message) {
        super(message);
    }

    public ImportException(String message, Throwable cause) {
        super(message, cause);
    }
}
