package io.github.skylens.mobile.core;

/** 导入进度回调。fraction 为 0..1；小于 0 表示进度未知（显示不确定进度条）。 */
public interface Progress {
    void update(double fraction, String message);

    boolean isCancelled();

    Progress NONE = new Progress() {
        @Override public void update(double fraction, String message) { }
        @Override public boolean isCancelled() { return false; }
    };

    /** 把子任务的 0..1 映射到总进度的 [from, to] 区间。 */
    static Progress scaled(final Progress parent, final double from, final double to) {
        return new Progress() {
            @Override public void update(double fraction, String message) {
                parent.update(fraction < 0 ? -1 : from + (to - from) * Math.min(1, fraction), message);
            }
            @Override public boolean isCancelled() { return parent.isCancelled(); }
        };
    }
}
