package io.github.skylens.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.util.Base64;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import io.github.skylens.mobile.core.Library;
import io.github.skylens.mobile.core.MapEntry;
import io.github.skylens.mobile.core.MapRouter;
import io.github.skylens.mobile.core.SubwayEntranceBuilder;

/**
 * 在 WebView 里显示一张地图。
 * 网页以 https://appassets.androidplatform.net/ 为源，所有请求都在 shouldInterceptRequest 里由 MapRouter 在本地处理，
 * 其他任何域名的请求一律拒绝（完全离线）。
 */
public class MapActivity extends Activity {
    static final String EXTRA_ID = "id";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String TAG = "SkylensMap";

    private WebView web;
    private MapRouter router;
    private File dataDir;
    private final ExportFiles exportFiles = new ExportFiles();
    private static final int SAVE_EXPORT = 1201;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xFFE9ECE8);
        getWindow().setNavigationBarColor(0xFFE9ECE8);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        String id = getIntent().getStringExtra(EXTRA_ID);
        try {
            Library library = new Library(new java.io.File(getFilesDir(), "library"));
            MapEntry entry = library.get(id);
            if (entry == null) throw new FileNotFoundException("找不到这张地图，可能已被删除");
            router = new MapRouter(new MapRouter.AssetSource() {
                @Override public InputStream open(String path) throws IOException {
                    try {
                        return getAssets().open("web/" + path);
                    } catch (FileNotFoundException e) {
                        return null;
                    }
                }
            }, library.dataDir(id));
            setTitle(entry.name);
            dataDir = library.dataDir(id);
        } catch (IOException | RuntimeException e) {
            Toast.makeText(this, "无法打开地图：" + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        final FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0xE9, 0xEC, 0xE8));
        final ProgressBar spinner = new ProgressBar(this);
        root.addView(spinner, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        setContentView(root);

        // 之前导入的地图没有地铁出入口表，首次打开时补生成。要解析十几 MB 的 JSON，不能放在界面线程里
        //（会卡住甚至触发 ANR），所以放到后台线程，生成期间显示加载圈；失败（包括内存不足）都只记日志，照常打开地图。
        final File snapshot = dataDir;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    SubwayEntranceBuilder.ensureGenerated(snapshot);
                } catch (Throwable error) {
                    Log.w(TAG, "Could not generate subway entrance table", error);
                }
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        if (!isFinishing() && !isDestroyed()) showMap(root, spinner);
                    }
                });
            }
        }, "skylens-entrances").start();
    }

    private void showMap(FrameLayout root, View spinner) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true); // 调试版可在电脑 Chrome 的 chrome://inspect 里查看
        }

        web = new WebView(this);
        web.addJavascriptInterface(exportFiles, "SkylensFiles");
        web.setBackgroundColor(0xFFE9ECE8);
        configure(web.getSettings());
        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.removeView(spinner);
        web.loadUrl("https://" + HOST + "/");
    }

    private static void configure(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSafeBrowsingEnabled(false);
        s.setSupportZoom(false);           // 缩放交给地图自己处理
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    }

    private final class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !HOST.equalsIgnoreCase(uri.getHost())) {
                return toResponse(MapRouter.error(403, "Forbidden")); // 完全离线：拒绝一切外部请求
            }
            if (!"GET".equalsIgnoreCase(request.getMethod())) {
                return toResponse(MapRouter.error(405, "Method Not Allowed"));
            }
            return toResponse(router.resolve(uri.getPath()));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (HOST.equalsIgnoreCase(uri.getHost())) return false;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("http") || scheme.equals("https")) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // 没有浏览器可用，忽略
                }
            }
            return true; // 不在应用内跳转到其他地方
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // 通常是地图数据太大，系统因内存不足结束了 WebView 渲染进程
            if (web != null) {
                ViewGroup parent = (ViewGroup) web.getParent();
                if (parent != null) parent.removeView(web);
                web.destroy();
                web = null;
            }
            if (!isFinishing()) {
                new AlertDialog.Builder(MapActivity.this)
                        .setTitle("地图被系统中断")
                        .setMessage(detail.didCrash()
                                ? "地图页面崩溃了。"
                                : "手机内存不足，系统结束了地图页面。城市数据很大时可能出现，可以关闭其他应用后再试。")
                        .setCancelable(false)
                        .setPositiveButton("返回", (d, w) -> finish())
                        .show();
            }
            return true;
        }
    }

    private static WebResourceResponse toResponse(MapRouter.Resource r) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        if (r.length >= 0) headers.put("Content-Length", Long.toString(r.length));
        return new WebResourceResponse(r.mime, r.charset, r.status, r.reason, headers, r.stream);
    }

    // Chunked transfer avoids a single enormous base64 message on Android's JS bridge.
    private final class ExportFiles {
        private File file;
        private FileOutputStream stream;
        private long bytes;
        private String name;
        private String mime;
        private boolean choosing;

        @JavascriptInterface public synchronized boolean beginFile(String filename, String type) {
            if (file != null || choosing || !("image/png".equals(type) || "image/svg+xml".equals(type))) return false;
            try {
                file = File.createTempFile("map-export-", ".tmp", getCacheDir());
                stream = new FileOutputStream(file);
                bytes = 0;
                mime = type;
                name = filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
                if (name.length() > 160) name = name.substring(0, 150) + (type.equals("image/png") ? ".png" : ".svg");
                return true;
            } catch (IOException | RuntimeException error) { cancelFile(); return false; }
        }

        @JavascriptInterface public synchronized boolean appendFile(String encoded) {
            if (stream == null || choosing || encoded == null || encoded.length() > 65536) return false;
            try {
                byte[] chunk = Base64.decode(encoded, Base64.NO_WRAP);
                if (bytes + chunk.length > 128L * 1024 * 1024) { cancelFile(); return false; }
                stream.write(chunk); bytes += chunk.length; return true;
            } catch (IOException | RuntimeException error) { cancelFile(); return false; }
        }

        @JavascriptInterface public synchronized void finishFile() {
            if (stream == null || choosing) return;
            try { stream.close(); stream = null; } catch (IOException error) { cancelFile(); fileResult(false, error.getMessage()); return; }
            choosing = true;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) { cancelFile(); return; }
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(mime);
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(intent, SAVE_EXPORT);
                } catch (RuntimeException error) { cancelFile(); fileResult(false, "无法打开文件保存窗口：" + error.getMessage()); }
            });
        }

        @JavascriptInterface public synchronized void cancelFile() {
            if (stream != null) try { stream.close(); } catch (IOException ignored) { }
            stream = null;
            if (file != null) file.delete();
            file = null; bytes = 0; choosing = false;
        }
    }

    private void fileResult(boolean canceled, String error) {
        runOnUiThread(() -> {
            if (web == null || isDestroyed()) return;
            String detail = "{\"canceled\":" + canceled + (error == null ? "" : ",\"error\":" + JSONObject.quote(error)) + "}";
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('skylens:file-saved',{detail:" + detail + "}))", null);
        });
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SAVE_EXPORT) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            exportFiles.cancelFile(); fileResult(true, null); return;
        }
        final Uri target = data.getData();
        new Thread(() -> {
            try {
                File source;
                synchronized (exportFiles) { source = exportFiles.file; }
                if (source == null) throw new IOException("导出文件已失效，请重新生成");
                try (InputStream input = new java.io.FileInputStream(source);
                     OutputStream output = getContentResolver().openOutputStream(target, "wt")) {
                    if (output == null) throw new IOException("无法写入所选位置");
                    byte[] buffer = new byte[65536]; int length;
                    while ((length = input.read(buffer)) >= 0) output.write(buffer, 0, length);
                }
                fileResult(false, null);
            } catch (IOException | RuntimeException error) { fileResult(false, error.getMessage()); }
            finally { exportFiles.cancelFile(); }
        }, "skylens-save-image").start();
    }

    @Override
    public void onBackPressed() {
        finish();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        exportFiles.cancelFile();
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
