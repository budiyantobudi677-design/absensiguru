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

    // Cache koordinat presisi tinggi yang dibagikan antar pemanggilan
    private static Location sLatestAccurateLocation = null;
    private static long sLatestAccurateTime = 0;
    private static LocationListener sWarmupListener = null;

    /**
     * Pemanasan modul GPS di latar belakang sejak halaman dibuka
     */
    @PluginMethod
    public void warmUpLocation(PluginCall call) {
        Context context = getContext();
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            if (call != null) call.resolve(new JSObject().put("warmed", false));
            return;
        }

        try {
            boolean isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean isFusedEnabled = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    isFusedEnabled = locationManager.isProviderEnabled(LocationManager.FUSED_PROVIDER);
                } catch (Exception ignored) {}
            }

            if (sWarmupListener == null && (isGpsEnabled || isFusedEnabled)) {
                sWarmupListener = new LocationListener() {
                    @Override
                    public void onLocationChanged(Location location) {
                        if (location != null && location.hasAccuracy() && location.getAccuracy() <= 35.0f) {
                            sLatestAccurateLocation = location;
                            sLatestAccurateTime = SystemClock.elapsedRealtime();
                        }
                    }
                    @Override
                    public void onStatusChanged(String provider, int status, Bundle extras) {}
                    @Override
                    public void onProviderEnabled(String provider) {}
                    @Override
                    public void onProviderDisabled(String provider) {}
                };

                if (isFusedEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        locationManager.requestLocationUpdates(LocationManager.FUSED_PROVIDER, 1000L, 0f, sWarmupListener, Looper.getMainLooper());
                    } catch (Exception ignored) {}
                }
                if (isGpsEnabled) {
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, sWarmupListener, Looper.getMainLooper());
                }
            }

            if (call != null) {
                JSObject ret = new JSObject();
                ret.put("warmed", true);
                call.resolve(ret);
            }
        } catch (Exception e) {
            if (call != null) call.resolve(new JSObject().put("warmed", false));
        }
    }

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

            long nowElapsed = SystemClock.elapsedRealtime();

            // 1. Periksa apakah sudah ada cache hangat hasil pre-warming yang akurat & segar (< 20 detik)
            if (sLatestAccurateLocation != null) {
                long warmAge = nowElapsed - sLatestAccurateTime;
                float warmAcc = sLatestAccurateLocation.hasAccuracy() ? sLatestAccurateLocation.getAccuracy() : 999f;
                if (warmAge < 20000L && warmAcc <= 25.0f) {
                    returnLocationResult(call, sLatestAccurateLocation);
                    return;
                }
            }

            // 2. Periksa cache lokasi terakhir sistem yang benar-benar akurat (< 20 detik & <= 25m)
            Location lastGps = isGpsEnabled ? locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER) : null;
            Location lastFused = null;
            if (isFusedEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    lastFused = locationManager.getLastKnownLocation(LocationManager.FUSED_PROVIDER);
                } catch (Exception ignored) {}
            }

            Location[] candidates = new Location[]{ lastGps, lastFused };
            for (Location cand : candidates) {
                if (cand == null) continue;
                long candAge = Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1
                    ? (nowElapsed - (cand.getElapsedRealtimeNanos() / 1000000L)) : 60000L;
                float candAcc = cand.hasAccuracy() ? cand.getAccuracy() : 999f;
                if (candAge < 20000L && candAcc <= 25.0f) {
                    sLatestAccurateLocation = cand;
                    sLatestAccurateTime = nowElapsed;
                    returnLocationResult(call, cand);
                    return;
                }
            }

            // 3. Mulai pencarian aktif lokasi presisi satelit
            final Location[] bestLiveCandidate = new Location[]{ null };
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
                    if (bestLiveCandidate[0] == null || acc < prevAcc) {
                        bestLiveCandidate[0] = location;
                    }

                    // Kunci seketika jika:
                    // a) Berasal dari satelit GPS dengan akurasi <= 35 meter
                    // b) Atau berasal dari provider manapun dengan akurasi sangat presisi <= 20 meter
                    boolean isGpsFix = LocationManager.GPS_PROVIDER.equals(location.getProvider()) && acc <= 35.0f;
                    if (acc <= 20.0f || isGpsFix) {
                        resolved[0] = true;
                        timeoutHandler.removeCallbacksAndMessages(null);
                        try {
                            locationManager.removeUpdates(this);
                        } catch (Exception ignored) {}

                        sLatestAccurateLocation = location;
                        sLatestAccurateTime = SystemClock.elapsedRealtime();
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

            // Beri waktu hingga 10 detik agar satelit GPS punya cukup waktu lock
            timeoutHandler.postDelayed(() -> {
                if (resolved[0]) return;
                resolved[0] = true;
                try {
                    locationManager.removeUpdates(precisionListener);
                } catch (Exception ignored) {}

                if (bestLiveCandidate[0] != null) {
                    float finalAcc = bestLiveCandidate[0].hasAccuracy() ? bestLiveCandidate[0].getAccuracy() : 999f;
                    // Hanya izinkan jika akurasi masuk akal (<= 60 meter) agar tidak melempar titik BTS ratusan meter
                    if (finalAcc <= 60.0f) {
                        sLatestAccurateLocation = bestLiveCandidate[0];
                        sLatestAccurateTime = SystemClock.elapsedRealtime();
                        returnLocationResult(call, bestLiveCandidate[0]);
                    } else {
                        call.reject("Sinyal GPS belum stabil (Akurasi ±" + Math.round(finalAcc) + "m). Silakan tunggu sesaat di area terbuka agar satelit GPS terkunci.");
                    }
                } else {
                    call.reject("Timeout GPS: Tidak dapat mengunci satelit dalam waktu yang ditentukan. Pastikan GPS aktif dan berada di area terbuka.");
                }
            }, 10000);

            // Minta update aktif dari Fused, GPS, dan Network
            if (isFusedEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    locationManager.requestLocationUpdates(LocationManager.FUSED_PROVIDER, 400L, 0f, precisionListener, Looper.getMainLooper());
                } catch (Exception ignored) {}
            }
            if (isGpsEnabled) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 400L, 0f, precisionListener, Looper.getMainLooper());
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
