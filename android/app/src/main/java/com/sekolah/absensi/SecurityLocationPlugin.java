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

            if (!isGpsEnabled && !isNetworkEnabled) {
                call.reject("Layanan GPS perangkat belum diaktifkan");
                return;
            }

            // Cari lokasi terbaik yang sudah diketahui sebelumnya (GPS, Network, Passive)
            Location lastGps = isGpsEnabled ? locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER) : null;
            Location lastNetwork = isNetworkEnabled ? locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) : null;
            Location lastPassive = locationManager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER);

            Location bestLocation = lastGps;
            if (bestLocation == null || (lastNetwork != null && lastNetwork.getTime() > bestLocation.getTime())) {
                bestLocation = lastNetwork;
            }
            if (bestLocation == null || (lastPassive != null && lastPassive.getTime() > bestLocation.getTime())) {
                bestLocation = lastPassive;
            }

            // Jika ada lokasi segar (< 45 detik), langsung gunakan untuk respon instan
            long nowElapsed = SystemClock.elapsedRealtime();
            if (bestLocation != null) {
                long locationElapsed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 ? 
                    bestLocation.getElapsedRealtimeNanos() / 1000000L : 0;
                if (locationElapsed > 0 && (nowElapsed - locationElapsed) < 45000) {
                    returnLocationResult(call, bestLocation);
                    return;
                }
            }

            final Location fallbackCached = bestLocation;
            final Handler timeoutHandler = new Handler(Looper.getMainLooper());

            // Minta single update
            LocationListener singleListener = new LocationListener() {
                private boolean resolved = false;

                @Override
                public void onLocationChanged(Location location) {
                    if (!resolved) {
                        resolved = true;
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

            // Safety timeout 6.5 detik: jangan biarkan promise menggantung selamanya
            timeoutHandler.postDelayed(() -> {
                try {
                    locationManager.removeUpdates(singleListener);
                } catch (Exception ignored) {}

                if (fallbackCached != null) {
                    returnLocationResult(call, fallbackCached);
                } else {
                    call.reject("Timeout GPS: Tidak dapat mengunci satelit dalam waktu yang ditentukan.");
                }
            }, 6500);

            // Minta update dari Network (cepat dalam ruangan) dan GPS (akurat di luar)
            if (isNetworkEnabled) {
                locationManager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, singleListener, Looper.getMainLooper());
            }
            if (isGpsEnabled) {
                locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, singleListener, Looper.getMainLooper());
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
}
