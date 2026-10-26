package com.bunnymomos.inventory;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

/**
 * Speech to text for the voice buttons (Ask Bunny, Quick Add expense, sales cash count). Opens
 * the phone's own speech screen (Google), which records and recognises Bengali (bn-IN) or English
 * and hands back the text - free, and the app itself never needs the microphone permission.
 * Turning the text into form fields happens on the server (/ai/voice-fill); see src/utils/voice.ts.
 */
@CapacitorPlugin(name = "Voice")
public class VoicePlugin extends Plugin {

    @PluginMethod
    public void available(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        JSObject result = new JSObject();
        result.put("available", intent.resolveActivity(getContext().getPackageManager()) != null);
        call.resolve(result);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        String language = call.getString("language", "bn-IN");
        String prompt = call.getString("prompt", "");
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        if (!prompt.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        try {
            startActivityForResult(call, intent, "listenResult");
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no speech recognition. Install or update the Google app.", "NO_RECOGNIZER");
        }
    }

    @ActivityCallback
    private void listenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        ArrayList<String> matches = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (result.getResultCode() != Activity.RESULT_OK || matches == null || matches.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("text", "");
            empty.put("alternatives", new JSArray());
            call.resolve(empty);
            return;
        }
        JSObject out = new JSObject();
        out.put("text", matches.get(0));
        out.put("alternatives", new JSArray(matches));
        call.resolve(out);
    }
}
