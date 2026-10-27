// Where the rider screens get their data and phone features: the real api functions, the
// app-wide location sharing, the Android ride alert and the phone's GPS by default, or the dev
// preview's mock (src/gallery/ridersPreview) so the screens can be looked at without signing in.
// Same calls as before - this only names them in one place.
import { createContext, useContext, type ReactNode } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import * as api from '../../utils/api';
import { openRiderLocationSettings } from '../../utils/riderTracking';
import { refreshRiderLocationSharing, useRiderTrackingState } from '../../utils/riderLocationSharing';
import {
  getRiderAlertStatus, isRiderAlertRinging, openRiderAlertSetting, riderAlertSupported, stopRiderAlert, testRiderAlert,
} from '../../utils/riderAlert';

export type RiderApi = {
  getRiderTrips: typeof api.getRiderTrips;
  getRiderTripsRange: typeof api.getRiderTripsRange;
  getRiders: typeof api.getRiders;
  callRider: typeof api.callRider;
  markRiderTripReady: typeof api.markRiderTripReady;
  advanceRiderTrip: typeof api.advanceRiderTrip;
  confirmRiderReceipt: typeof api.confirmRiderReceipt;
  cancelRiderTrip: typeof api.cancelRiderTrip;
  getRiderTripLocation: typeof api.getRiderTripLocation;
  getRiderTripEta: typeof api.getRiderTripEta;
  getRiderPlaces: typeof api.getRiderPlaces;
  setRiderPlace: typeof api.setRiderPlace;
  proposeRiderFare: typeof api.proposeRiderFare;
  decideRiderFare: typeof api.decideRiderFare;
  getRiderProfile: typeof api.getRiderProfile;
  saveRiderProfile: typeof api.saveRiderProfile;
  setRiderAvailability: typeof api.setRiderAvailability;
  getRiderSummary: typeof api.getRiderSummary;
  // Phone features
  useTrackingState: typeof useRiderTrackingState;
  refreshLocationSharing: typeof refreshRiderLocationSharing;
  openLocationSettings: typeof openRiderLocationSettings;
  alertSupported: typeof riderAlertSupported;
  getAlertStatus: typeof getRiderAlertStatus;
  openAlertSetting: typeof openRiderAlertSetting;
  testAlert: typeof testRiderAlert;
  isAlertRinging: typeof isRiderAlertRinging;
  stopAlert: typeof stopRiderAlert;
  getCurrentPosition: () => Promise<{ latitude: number; longitude: number }>;
};

export const realRiderApi: RiderApi = {
  getRiderTrips: api.getRiderTrips,
  getRiderTripsRange: api.getRiderTripsRange,
  getRiders: api.getRiders,
  callRider: api.callRider,
  markRiderTripReady: api.markRiderTripReady,
  advanceRiderTrip: api.advanceRiderTrip,
  confirmRiderReceipt: api.confirmRiderReceipt,
  cancelRiderTrip: api.cancelRiderTrip,
  getRiderTripLocation: api.getRiderTripLocation,
  getRiderTripEta: api.getRiderTripEta,
  getRiderPlaces: api.getRiderPlaces,
  setRiderPlace: api.setRiderPlace,
  proposeRiderFare: api.proposeRiderFare,
  decideRiderFare: api.decideRiderFare,
  getRiderProfile: api.getRiderProfile,
  saveRiderProfile: api.saveRiderProfile,
  setRiderAvailability: api.setRiderAvailability,
  getRiderSummary: api.getRiderSummary,
  useTrackingState: useRiderTrackingState,
  refreshLocationSharing: refreshRiderLocationSharing,
  openLocationSettings: openRiderLocationSettings,
  alertSupported: riderAlertSupported,
  getAlertStatus: getRiderAlertStatus,
  openAlertSetting: openRiderAlertSetting,
  testAlert: testRiderAlert,
  isAlertRinging: isRiderAlertRinging,
  stopAlert: stopRiderAlert,
  getCurrentPosition: async () => {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  },
};

const RiderApiContext = createContext<RiderApi>(realRiderApi);

export function RiderApiProvider({ value, children }: { value: RiderApi; children?: ReactNode }) {
  return <RiderApiContext.Provider value={value}>{children}</RiderApiContext.Provider>;
}

export function useRiderApi(): RiderApi {
  return useContext(RiderApiContext);
}
