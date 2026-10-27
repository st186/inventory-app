package com.bunnymomos.inventory;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Saves a file the app made (for now the full backup) where the person can find it, then opens the
 * share sheet so it can also go to Drive, WhatsApp, email and so on. A web view cannot "download"
 * a blob: link, which is why the old Backup button did nothing in the Android app.
 *
 * saveFile({ name, base64, mimeType, append, done, share }): the JS side (src/utils/saveFile.ts)
 * sends the file in pieces of about 1 MB, because one huge base64 string through the bridge can run
 * the web view out of memory. Pieces are added to a file in the app's cache; the last one (done)
 * copies it to Downloads/Bunny Momos via MediaStore on Android 10+, which needs no storage
 * permission, or to the app's own Documents folder on older phones, and then shares it.
 */
@CapacitorPlugin(name = "Files")
public class FilePlugin extends Plugin {

    private static final String SUBFOLDER = "Bunny Momos";

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = safeName(call.getString("name", "file"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64", "");
        boolean append = Boolean.TRUE.equals(call.getBoolean("append", false));
        boolean done = Boolean.TRUE.equals(call.getBoolean("done", true));
        boolean share = Boolean.TRUE.equals(call.getBoolean("share", true));

        File temp = new File(getContext().getCacheDir(), "saving-" + name);
        try (OutputStream out = new FileOutputStream(temp, append)) {
            if (!base64.isEmpty()) out.write(Base64.decode(base64, Base64.DEFAULT));
        } catch (IOException | IllegalArgumentException e) {
            temp.delete();
            call.reject("Could not write the file: " + e.getMessage());
            return;
        }
        if (!done) {
            call.resolve();
            return;
        }

        try {
            Uri uri = null;
            String location = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    uri = saveToDownloads(temp, name, mimeType);
                    location = Environment.DIRECTORY_DOWNLOADS + "/" + SUBFOLDER + "/" + name;
                } catch (IOException | RuntimeException e) {
                    uri = null; // some phones refuse MediaStore; fall back to the app's folder
                }
            }
            if (uri == null) {
                File saved = saveToAppDocuments(temp, name);
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", saved);
                location = saved.getAbsolutePath();
            }
            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("location", location);
            if (share) openShareSheet(uri, mimeType, name);
            call.resolve(result);
        } catch (IOException | RuntimeException e) {
            call.reject("Could not save the file: " + e.getMessage());
        } finally {
            temp.delete();
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    private Uri saveToDownloads(File source, String name, String mimeType) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SUBFOLDER);
        // Hidden from other apps until the copy is complete.
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Downloads is not available");
        try (InputStream in = new FileInputStream(source); OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Downloads is not available");
            copy(in, out);
        } catch (IOException | RuntimeException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        ContentValues finished = new ContentValues();
        finished.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, finished, null, null);
        return uri;
    }

    private File saveToAppDocuments(File source, String name) throws IOException {
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) dir = new File(getContext().getFilesDir(), "Documents");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot make the Documents folder");
        File target = new File(dir, name);
        try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
        }
        return target;
    }

    private void openShareSheet(Uri uri, String mimeType, String name) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, name);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "Save or share " + name);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().runOnUiThread(() -> getActivity().startActivity(chooser));
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
    }

    // No folders or characters that file systems reject.
    private static String safeName(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return cleaned.isEmpty() ? "file" : cleaned;
    }
}
