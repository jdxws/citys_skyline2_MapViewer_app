package io.github.skylens.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.text.DateFormat;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.github.skylens.mobile.core.ImportCancelledException;
import io.github.skylens.mobile.core.ImportException;
import io.github.skylens.mobile.core.Importer;
import io.github.skylens.mobile.core.Library;
import io.github.skylens.mobile.core.MapEntry;
import io.github.skylens.mobile.core.Progress;

/** 地图库：导入快照（ZIP 或文件夹）、列出、重命名、删除、打开。 */
public class MainActivity extends Activity {
    private static final int REQ_ZIP = 1001;
    private static final int REQ_TREE = 1002;

    private static final int BG = 0xFF0E1620;
    private static final int PANEL = 0xFF152230;
    private static final int PANEL2 = 0xFF1B2B3B;
    private static final int LINE = 0xFF27394B;
    private static final int TEXT = 0xFFE8F0F6;
    private static final int MUTED = 0xFF8DA1B3;
    private static final int ACCENT = 0xFF3FB8A0;
    private static final int ACCENT_STRONG = 0xFF2A9D87;
    private static final int DANGER = 0xFFE5646B;

    private static boolean libraryInitialized;

    private Library library;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private LinearLayout listView;
    private TextView emptyView;
    private TextView countView;
    private View overlay;
    private TextView progressMessage;
    private ProgressBar bar;
    private Button cancelButton;

    private boolean busy;
    private volatile boolean cancelRequested;

    private interface Job {
        List<MapEntry> run(Progress progress) throws IOException;
    }

    // ------------------------------------------------------------ 生命周期

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        try {
            library = new Library(new File(getFilesDir(), "library"));
            synchronized (MainActivity.class) {
                if (!libraryInitialized) {
                    library.init();
                    libraryInitialized = true;
                }
            }
        } catch (IOException e) {
            Toast.makeText(this, "无法初始化地图库：" + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        setContentView(buildUi());
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (library != null && !busy) refresh();
    }

    @Override
    protected void onDestroy() {
        worker.shutdown();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (busy) requestCancel();
        else super.onBackPressed();
    }

    // ------------------------------------------------------------ 界面

    private View buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(22), dp(18), dp(24));
        scroll.addView(content, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        content.addView(text("SKYLENS", 26, TEXT, true));
        content.addView(text("离线查看《城市：天际线 2》城市地图快照", 13, MUTED, false));

        // 导入卡片
        LinearLayout importCard = card();
        importCard.addView(text("导入地图", 17, TEXT, true));
        TextView hint = text("选择快照 ZIP（推荐），或包含快照的文件夹（快照目录、dist 里的 data、游戏的 snapshots 目录）。", 13, MUTED, false);
        hint.setPadding(0, dp(4), 0, dp(12));
        importCard.addView(hint);
        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        Button zip = button("选择 ZIP…", true);
        zip.setOnClickListener(v -> pickZip());
        Button folder = button("选择文件夹…", false);
        folder.setOnClickListener(v -> pickFolder());
        buttons.addView(zip, weighted(0, 0, dp(6), 0));
        buttons.addView(folder, weighted(dp(6), 0, 0, 0));
        importCard.addView(buttons);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardParams.topMargin = dp(18);
        content.addView(importCard, cardParams);

        // 列表标题
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.BOTTOM);
        head.addView(text("我的地图", 16, TEXT, true));
        countView = text("", 13, MUTED, false);
        countView.setPadding(dp(8), 0, 0, dp(1));
        head.addView(countView);
        LinearLayout.LayoutParams headParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        headParams.topMargin = dp(24);
        headParams.bottomMargin = dp(8);
        content.addView(head, headParams);

        listView = new LinearLayout(this);
        listView.setOrientation(LinearLayout.VERTICAL);
        content.addView(listView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        emptyView = text("还没有导入任何地图。点上面的按钮选择快照即可开始。", 14, MUTED, false);
        emptyView.setGravity(Gravity.CENTER);
        emptyView.setPadding(dp(16), dp(28), dp(16), dp(28));
        emptyView.setBackground(rounded(Color.TRANSPARENT, dp(14), LINE));
        content.addView(emptyView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView footer = text("提示：Android 不允许直接选择“下载”等根目录，请选其中的子文件夹，或改用 ZIP。\n"
                + "地图只保存在本应用内；本应用不会联网读取任何数据。\n"
                + "内置的地图网页来自 SKYLENS MAPS（GPL-3.0-only）。", 12, MUTED, false);
        footer.setPadding(0, dp(22), 0, 0);
        content.addView(footer);

        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay = buildOverlay();
        overlay.setVisibility(View.GONE);
        root.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return root;
    }

    private View buildOverlay() {
        FrameLayout layer = new FrameLayout(this);
        layer.setBackgroundColor(0xB8060A0F);
        layer.setClickable(true); // 拦截触摸，防止导入时误操作

        LinearLayout panel = card();
        panel.setPadding(dp(22), dp(20), dp(22), dp(18));
        panel.addView(text("正在导入…", 17, TEXT, true));
        progressMessage = text("", 13, MUTED, false);
        progressMessage.setPadding(0, dp(6), 0, dp(10));
        panel.addView(progressMessage);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(1000);
        bar.setProgressTintList(ColorStateList.valueOf(ACCENT));
        bar.setIndeterminateTintList(ColorStateList.valueOf(ACCENT));
        panel.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(10)));
        TextView note = text("大型城市的数据有几百 MB，请保持屏幕常亮、不要切换到其他应用。", 12, MUTED, false);
        note.setPadding(0, dp(10), 0, dp(12));
        panel.addView(note);
        cancelButton = button("取消", false);
        cancelButton.setOnClickListener(v -> requestCancel());
        panel.addView(cancelButton);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        params.leftMargin = dp(24);
        params.rightMargin = dp(24);
        layer.addView(panel, params);
        return layer;
    }

    private void refresh() {
        List<MapEntry> maps = library.list();
        listView.removeAllViews();
        NumberFormat numbers = NumberFormat.getIntegerInstance(Locale.CHINA);
        DateFormat dates = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT);
        for (MapEntry entry : maps) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.bottomMargin = dp(10);
            listView.addView(mapCard(entry, numbers, dates), params);
        }
        emptyView.setVisibility(maps.isEmpty() ? View.VISIBLE : View.GONE);
        countView.setText(maps.isEmpty() ? "" : maps.size() + " 张");
    }

    private View mapCard(final MapEntry entry, NumberFormat numbers, DateFormat dates) {
        LinearLayout card = card();
        card.setOnClickListener(v -> openMap(entry.id));

        TextView title = text(entry.name, 17, TEXT, true);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(title);

        List<String> stats = new ArrayList<>();
        if (entry.buildings >= 0) stats.add("建筑 " + numbers.format(entry.buildings));
        if (entry.roads >= 0) stats.add("道路 " + numbers.format(entry.roads));
        if (entry.pois >= 0) stats.add("兴趣点 " + numbers.format(entry.pois));
        if (entry.routes >= 0) stats.add("线路 " + numbers.format(entry.routes));
        if (!stats.isEmpty()) {
            TextView statsView = text(join(stats, "   "), 13, TEXT, false);
            statsView.setPadding(0, dp(4), 0, 0);
            card.addView(statsView);
        }
        TextView meta = text(Importer.formatBytes(entry.bytes) + " · 导入于 " + dates.format(new Date(entry.importedAtMillis))
                + "\nID " + entry.id, 12, MUTED, false);
        meta.setPadding(0, dp(3), 0, dp(12));
        card.addView(meta);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button open = button("打开", true);
        open.setOnClickListener(v -> openMap(entry.id));
        Button rename = button("重命名", false);
        rename.setOnClickListener(v -> askRename(entry));
        Button delete = button("删除", false);
        delete.setTextColor(0xFFFFB3B7);
        delete.setOnClickListener(v -> confirmDelete(entry));
        row.addView(open, weighted(0, 0, dp(4), 0));
        row.addView(rename, weighted(dp(4), 0, dp(4), 0));
        row.addView(delete, weighted(dp(4), 0, 0, 0));
        card.addView(row);
        return card;
    }

    // ------------------------------------------------------------ 地图操作

    private void openMap(String id) {
        if (busy) return;
        startActivity(new Intent(this, MapActivity.class).putExtra(MapActivity.EXTRA_ID, id));
    }

    private void askRename(final MapEntry entry) {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setSingleLine(true);
        input.setText(entry.name);
        input.setSelectAllOnFocus(true);
        FrameLayout holder = new FrameLayout(this);
        holder.setPadding(dp(20), dp(8), dp(20), 0);
        holder.addView(input, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        new AlertDialog.Builder(this)
                .setTitle("重命名地图")
                .setView(holder)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    try {
                        library.rename(entry.id, input.getText().toString());
                        refresh();
                    } catch (IOException e) {
                        Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                })
                .show();
    }

    private void confirmDelete(final MapEntry entry) {
        new AlertDialog.Builder(this)
                .setTitle("删除“" + entry.name + "”？")
                .setMessage("只会删除导入到本应用里的副本，不会动你原来的文件。")
                .setNegativeButton("取消", null)
                .setPositiveButton("删除", (d, w) -> worker.execute(() -> {
                    String error = null;
                    try {
                        library.remove(entry.id);
                    } catch (IOException e) {
                        error = "删除失败：" + e.getMessage();
                    }
                    final String message = error;
                    ui.post(() -> {
                        if (message != null) Toast.makeText(this, message, Toast.LENGTH_LONG).show();
                        refresh();
                    });
                }))
                .show();
    }

    // ------------------------------------------------------------ 导入

    private void pickZip() {
        if (busy) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/zip", "application/x-zip-compressed", "application/x-zip", "application/octet-stream"});
        launch(intent, REQ_ZIP);
    }

    private void pickFolder() {
        if (busy) return;
        launch(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_TREE);
    }

    private void launch(Intent intent, int request) {
        try {
            startActivityForResult(intent, request);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "找不到系统的文件选择器", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        if (requestCode == REQ_ZIP) importZip(uri);
        else if (requestCode == REQ_TREE) importFolder(uri);
    }

    private void importZip(final Uri uri) {
        final String name = queryString(uri, OpenableColumns.DISPLAY_NAME);
        final long size = queryLong(uri, OpenableColumns.SIZE);
        runImport(progress -> {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) throw new FileNotFoundException("无法打开所选文件");
                return Importer.importZip(in, size, name, library, progress);
            }
        });
    }

    private void importFolder(final Uri treeUri) {
        runImport(progress -> {
            DocumentNode root = DocumentNode.root(this, treeUri);
            return Importer.importTree(root, root.name(), library, progress);
        });
    }

    private void runImport(final Job job) {
        if (busy) return;
        busy = true;
        cancelRequested = false;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        cancelButton.setEnabled(true);
        overlay.setVisibility(View.VISIBLE);
        applyProgress(-1, "正在准备…");

        final Progress progress = new Progress() {
            private long last;

            @Override public void update(final double fraction, final String message) {
                long now = SystemClock.uptimeMillis();
                if (now - last < 100 && fraction < 1) return;
                last = now;
                ui.post(() -> applyProgress(fraction, message));
            }

            @Override public boolean isCancelled() {
                return cancelRequested;
            }
        };

        worker.execute(() -> {
            List<MapEntry> result = null;
            String error = null;
            boolean cancelled = false;
            try {
                result = job.run(progress);
            } catch (ImportCancelledException e) {
                cancelled = true;
            } catch (ImportException e) {
                error = e.getMessage();
            } catch (IOException e) {
                error = "导入失败：" + e.getMessage();
            } catch (Throwable t) {
                error = "导入失败：" + t;
            }
            final List<MapEntry> imported = result;
            final String message = error;
            final boolean wasCancelled = cancelled;
            ui.post(() -> finishImport(imported, message, wasCancelled));
        });
    }

    private void finishImport(List<MapEntry> imported, String error, boolean cancelled) {
        busy = false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        overlay.setVisibility(View.GONE);
        refresh();
        if (cancelled) {
            Toast.makeText(this, "已取消导入", Toast.LENGTH_SHORT).show();
        } else if (error != null) {
            new AlertDialog.Builder(this).setTitle("导入失败").setMessage(error).setPositiveButton("好", null).show();
        } else if (imported != null) {
            StringBuilder names = new StringBuilder();
            for (MapEntry entry : imported) {
                if (names.length() > 0) names.append("、");
                names.append("“").append(entry.name).append("”");
            }
            Toast.makeText(this, "已导入 " + imported.size() + " 张地图：" + names, Toast.LENGTH_LONG).show();
        }
    }

    private void requestCancel() {
        cancelRequested = true;
        cancelButton.setEnabled(false);
        progressMessage.setText("正在取消…");
    }

    private void applyProgress(double fraction, String message) {
        if (cancelRequested) return;
        progressMessage.setText(message == null ? "" : message);
        if (fraction < 0) {
            bar.setIndeterminate(true);
        } else {
            bar.setIndeterminate(false);
            bar.setProgress((int) Math.round(Math.min(1.0, fraction) * 1000));
        }
    }

    private String queryString(Uri uri, String column) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{column}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (RuntimeException ignored) {
            // 查不到名称也没关系
        }
        return "";
    }

    private long queryLong(Uri uri, String column) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{column}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (RuntimeException ignored) {
            // 查不到大小也没关系
        }
        return 0;
    }

    // ------------------------------------------------------------ 小工具

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private TextView text(String value, float sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private GradientDrawable rounded(int fill, int radius, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(rounded(PANEL, dp(14), LINE));
        return card;
    }

    private Button button(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        button.setTextColor(primary ? Color.WHITE : TEXT);
        button.setTypeface(primary ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        button.setMinHeight(0);
        button.setMinimumHeight(dp(44));
        button.setBackground(rounded(primary ? ACCENT_STRONG : PANEL2, dp(10), primary ? ACCENT : LINE));
        return button;
    }

    private LinearLayout.LayoutParams weighted(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.setMargins(left, top, right, bottom);
        return params;
    }

    private static String join(List<String> parts, String separator) {
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (out.length() > 0) out.append(separator);
            out.append(part);
        }
        return out.toString();
    }
}
