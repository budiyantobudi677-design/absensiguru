package com.sekolah.absensi;

import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
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

            Location bestLocation = null;
            if (isGpsEnabled) {
                bestLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (bestLocation == null && isNetworkEnabled) {
                bestLocation = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }

            // Jika lokasi lama atau null, minta 1 kali fix
            if (bestLocation != null && (SystemClock.elapsedRealtime() - (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 ? bestLocation.getElapsedRealtimeNanos() / 1000000 : 0)) < 60000) {
                returnLocationResult(call, bestLocation);
                return;
            }

            // Minta single update
            LocationListener singleListener = new LocationListener() {
                private boolean resolved = false;

                @Override
                public void onLocationChanged(Location location) {
                    if (!resolved) {
                        resolved = true;
                        locationManager.removeUpdates(this);
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

            String provider = isGpsEnabled ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            locationManager.requestSingleUpdate(provider, singleListener, null);

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
