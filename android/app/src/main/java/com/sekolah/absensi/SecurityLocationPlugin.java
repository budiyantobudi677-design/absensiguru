package com.sekolah.absensi;

import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SecurityLocation")
public class SecurityLocationPlugin extends Plugin {

    @PluginMethod
    public void getSecureLocation(PluginCall call) {
        Context context = getContext();
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);

        if (locationManager == null) {
            call.reject("Location manager tidak tersedia");
            return;
        }

        try {
            boolean isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            boolean isFusedEnabled = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    isFusedEnabled = locationManager.isProviderEnabled(LocationManager.FUSED_PROVIDER);
                } catch (Exception ignored) {}
            }

            if (!isGpsEnabled && !isNetworkEnabled && !isFusedEnabled) {
                call.reject("Layanan GPS perangkat belum diaktifkan");
                return;
            }

            // Cari lokasi terbaik yang sudah diketahui sebelumnya (Utamakan GPS & Fused dengan akurasi tinggi)
            Location lastGps = isGpsEnabled ? locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER) : null;
            Location lastFused = null;
            if (isFusedEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    lastFused = locationManager.getLastKnownLocation(LocationManager.FUSED_PROVIDER);
                } catch (Exception ignored) {}
            }
            Location lastNetwork = isNetworkEnabled ? locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) : null;
            Location lastPassive = locationManager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER);

            long nowElapsed = SystemClock.elapsedRealtime();

            // Pilih kandidat cache paling presisi (utamakan yang segar < 20 detik dan akurasi <= 25 meter)
            Location bestLocation = null;
            Location[] candidates = new Location[]{ lastGps, lastFused, lastPassive, lastNetwork };
            for (Location cand : candidates) {
                if (cand == null) continue;
                if (bestLocation == null) {
                    bestLocation = cand;
                } else {
                    long candAge = Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1
                        ? (nowElapsed - (cand.getElapsedRealtimeNanos() / 1000000L)) : 60000L;
                    long bestAge = Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1
                        ? (nowElapsed - (bestLocation.getElapsedRealtimeNanos() / 1000000L)) : 60000L;
                    float candAcc = cand.hasAccuracy() ? cand.getAccuracy() : 999f;
                    float bestAcc = bestLocation.hasAccuracy() ? bestLocation.getAccuracy() : 999f;

                    // Jika kandidat baru jauh lebih akurat (atau sama akurat tapi lebih baru), pilih kandidat tersebut
                    if (candAge < 45000 && (candAcc + 15f < bestAcc || (Math.abs(candAcc - bestAcc) <= 15f && candAge < bestAge))) {
                        bestLocation = cand;
                    }
                }
            }

            // Hanya gunakan cache secara instan jika benar-benar segar (< 15 detik) DAN presisi tinggi (akurasi <= 25m)
            if (bestLocation != null) {
                long locationElapsed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 ? 
                    bestLocation.getElapsedRealtimeNanos() / 1000000L : 0;
                float acc = bestLocation.hasAccuracy() ? bestLocation.getAccuracy() : 999f;
                if (locationElapsed > 0 && (nowElapsed - locationElapsed) < 15000 && acc <= 25.0f) {
                    returnLocationResult(call, bestLocation);
                    return;
                }
            }

            final Location[] bestLiveCandidate = new Location[]{ bestLocation };
            final Handler timeoutHandler = new Handler(Looper.getMainLooper());
            final boolean[] resolved = new boolean[]{ false };

            LocationListener precisionListener = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    if (resolved[0] || location == null) return;

                    float acc = location.hasAccuracy() ? location.getAccuracy() : 999f;
                    float prevAcc = (bestLiveCandidate[0] != null && bestLiveCandidate[0].hasAccuracy())
                        ? bestLiveCandidate[0].getAccuracy() : 9999f;

                    // Simpan jika lebih akurat dari kandidat sebelumnya
                    if (bestLiveCandidate[0] == null || acc <= prevAcc + 10f) {
                        bestLiveCandidate[0] = location;
                    }

                    // Jika akurasi sudah tajam (<= 30 meter) atau berasal langsung dari satelit GPS dengan akurasi <= 45m, langsung kunci!
                    boolean isGpsFix = LocationManager.GPS_PROVIDER.equals(location.getProvider()) && acc <= 45.0f;
                    if (acc <= 30.0f || isGpsFix) {
                        resolved[0] = true;
                        timeoutHandler.removeCallbacksAndMessages(null);
                        try {
                            locationManager.removeUpdates(this);
                        } catch (Exception ignored) {}
                        returnLocationResult(call, location);
                    }
                }

                @Override
                public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override
                public void onProviderEnabled(String provider) {}
                @Override
                public void onProviderDisabled(String provider) {}
            };

            // Jika dalam 4.5 detik sudah ada kandidat live yang lumayan atau tunggu hingga 6.5 detik maksimal
            timeoutHandler.postDelayed(() -> {
                if (resolved[0]) return;
                resolved[0] = true;
                try {
                    locationManager.removeUpdates(precisionListener);
                } catch (Exception ignored) {}

                if (bestLiveCandidate[0] != null) {
                    returnLocationResult(call, bestLiveCandidate[0]);
                } else {
                    call.reject("Timeout GPS: Tidak dapat mengunci satelit dalam waktu yang ditentukan.");
                }
            }, 5000);

            // Minta update aktif dari Fused, GPS, dan Network
            if (isFusedEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    locationManager.requestLocationUpdates(LocationManager.FUSED_PROVIDER, 500L, 0f, precisionListener, Looper.getMainLooper());
                } catch (Exception ignored) {}
            }
            if (isGpsEnabled) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 500L, 0f, precisionListener, Looper.getMainLooper());
            }
            if (isNetworkEnabled) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 500L, 0f, precisionListener, Looper.getMainLooper());
            }

        } catch (SecurityException e) {
            call.reject("Izin lokasi belum diberikan: " + e.getMessage());
        } catch (Exception e) {
            call.reject("Gagal mendapatkan lokasi aman: " + e.getMessage());
        }
    }

    private void returnLocationResult(PluginCall call, Location location) {
        if (location == null) {
            call.reject("Gagal memperoleh koordinat GPS");
            return;
        }

        boolean isMock = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            isMock = location.isMock();
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            isMock = location.isFromMockProvider();
        }

        JSObject ret = new JSObject();
        ret.put("latitude", location.getLatitude());
        ret.put("longitude", location.getLongitude());
        ret.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
        ret.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        ret.put("heading", location.hasBearing() ? location.getBearing() : null);
        ret.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        ret.put("isMock", isMock);
        ret.put("time", location.getTime());

        call.resolve(ret);
    }

    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        String base64Data = call.getString("base64");
        String fileName = call.getString("fileName");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Data gambar (base64) tidak boleh kosong");
            return;
        }

        if (fileName == null || fileName.isEmpty()) {
            fileName = "Timemark_" + System.currentTimeMillis() + ".jpg";
        }

        try {
            byte[] imageBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
            Context context = getContext();

            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, fileName);
            values.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/GammaraApp");
                values.put(android.provider.MediaStore.Images.Media.IS_PENDING, 1);
            }

            android.net.Uri uri = context.getContentResolver().insert(
                android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, 
                values
            );

            if (uri == null) {
                call.reject("Gagal membuat entri di MediaStore Galeri");
                return;
            }

            try (java.io.OutputStream out = context.getContentResolver().openOutputStream(uri)) {
                if (out != null) {
                    out.write(imageBytes);
                    out.flush();
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear();
                values.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0);
                context.getContentResolver().update(uri, values, null, null);
            } else {
                // Untuk Android 9 kebawah, beritahu MediaScanner agar langsung muncul di Galeri
                android.media.MediaScannerConnection.scanFile(
                    context, 
                    new String[]{ uri.getPath() }, 
                    new String[]{ "image/jpeg" }, 
                    null
                );
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("uri", uri.toString());
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Gagal menyimpan ke galeri: " + e.getMessage());
        }
    }
}
