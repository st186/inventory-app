package com.bunnymomos.inventory;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Voice for the app (Bunny chat, Quick Add expense, sales cash count):
 * - listen: opens the phone's own speech screen (Google), which records and recognises Bengali
 *   (bn-IN), English or Hindi and hands back the text - free, and the app itself never needs the
 *   microphone permission. Turning the text into form fields happens on the server (/ai/voice-fill).
 * - speak / stopSpeaking: reads Bunny's answers aloud with the phone's text-to-speech in the
 *   person's language (a Bengali or Hindi voice may need downloading in the phone's settings).
 * JS side: src/utils/voice.ts.
 */
@CapacitorPlugin(name = "Voice")
public class VoicePlugin extends Plugin {

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final List<PluginCall> waitingForTts = new ArrayList<>();
    // The last chunk of each speak() call -> that call, resolved when the chunk finishes.
    private final Map<String, PluginCall> speaking = new HashMap<>();
    private int utteranceCounter = 0;

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

    @PluginMethod
    public void speak(PluginCall call) {
        if (tts == null) {
            waitingForTts.add(call);
            tts = new TextToSpeech(getContext(), status -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (ttsReady) tts.setOnUtteranceProgressListener(new Progress());
                List<PluginCall> waiting = new ArrayList<>(waitingForTts);
                waitingForTts.clear();
                for (PluginCall c : waiting) {
                    if (ttsReady) speakNow(c);
                    else c.reject("This phone has no text-to-speech engine.", "NO_TTS");
                }
            });
            return;
        }
        if (!ttsReady) {
            waitingForTts.add(call);
            return;
        }
        speakNow(call);
    }

    private void speakNow(PluginCall call) {
        String text = call.getString("text", "");
        String language = call.getString("language", "bn-IN");
        int result = tts.setLanguage(Locale.forLanguageTag(language));
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("No voice for this language on the phone. Add it in Settings > Text-to-speech > Google > Install voice data.", "NO_VOICE");
            return;
        }
        List<String> chunks = chunk(text, 3000);
        if (chunks.isEmpty()) {
            JSObject done = new JSObject();
            done.put("done", true);
            call.resolve(done);
            return;
        }
        for (int i = 0; i < chunks.size(); i++) {
            String id = "bunny-" + (++utteranceCounter);
            if (i == chunks.size() - 1) speaking.put(id, call);
            tts.speak(chunks.get(i), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, id);
        }
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (tts != null) tts.stop();
        finishAll(false);
        call.resolve();
    }

    // Text-to-speech takes about 4,000 characters at a time: split at sentence ends.
    private static List<String> chunk(String text, int max) {
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String sentence : text.split("(?<=[.!?।\\n])")) {
            if (current.length() + sentence.length() > max && current.length() > 0) {
                out.add(current.toString().trim());
                current.setLength(0);
            }
            current.append(sentence);
        }
        if (current.toString().trim().length() > 0) out.add(current.toString().trim());
        return out;
    }

    private void finish(String utteranceId, boolean done) {
        PluginCall call = speaking.remove(utteranceId);
        if (call == null) return;
        JSObject out = new JSObject();
        out.put("done", done);
        call.resolve(out);
    }

    private void finishAll(boolean done) {
        for (String id : new ArrayList<>(speaking.keySet())) finish(id, done);
    }

    private class Progress extends UtteranceProgressListener {
        @Override public void onStart(String utteranceId) { }
        @Override public void onDone(String utteranceId) { finish(utteranceId, true); }
        @Override public void onError(String utteranceId) { finish(utteranceId, false); }
        @Override public void onStop(String utteranceId, boolean interrupted) { finish(utteranceId, false); }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        finishAll(false);
        super.handleOnDestroy();
    }
}
