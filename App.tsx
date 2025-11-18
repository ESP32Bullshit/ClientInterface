import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useColorScheme,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const ESP32_IP = '192.168.4.1';
const WS_URL = `ws://${ESP32_IP}/ws`;

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [location, setLocation] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState('Waiting for connection...');
  const [isSending, setIsSending] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const wsRef = useRef(null);

 useEffect(() => {
  const init = async () => {
    const ok = await checkConnection();
    if (ok) {
      connectWebSocket();   // only connect if ESP32 reachable
    }
  };
  init();
}, []);


  const connectWebSocket = () => {
    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setWsStatus('connected');
        setStatusMessage('WebSocket connected');
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        console.log('WebSocket message:', event.data);
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'buttonPressed') {
            setStatusMessage('Button pressed - fetching location...');
            handleLocationFetch();
          }
        } catch (e) {
          // console.log('Message:', event.data);
        }
      };

      

      ws.onclose = () => {
        setWsStatus('disconnected');
        setStatusMessage('WebSocket disconnected');
        console.log('WebSocket closed');
        setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      // setWsStatus('error');
      // setStatusMessage('Failed to connect WebSocket');
      // console.error('WebSocket connection error:', error);
    }
  };

  const checkConnection = async () => {
    try {
      const response = await fetch(`http://${ESP32_IP}/api/status`, {
        method: 'GET',
        timeout: 5000,
      });
      if (response.ok) {
        setIsConnected(true);
        setStatusMessage('Connected to ESP32');
        return true;
      }
    } catch (error) {
      setIsConnected(false);
      setStatusMessage('Cannot reach ESP32 - Check WiFi');
      return false;
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const getLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Location permission is required');
      return null;
    }

    setIsGettingLocation(true);
    setStatusMessage('Getting location...');

    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString(),
          };
          setLocation(coords);
          setStatusMessage('Location acquired');
          setIsGettingLocation(false);
          resolve(coords);
        },
        (error) => {
          console.log(error);
          setStatusMessage(`Location error: ${error.message}`);
          setIsGettingLocation(false);
          Alert.alert('Error', 'Failed to get location');
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  };

  const sendLocationToESP32 = async (coords) => {
    setIsSending(true);
    setStatusMessage('Sending location to ESP32...');
    
    try {
      const response = await fetch(`http://${ESP32_IP}/api/send_location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          timestamp: coords.timestamp,
        }),
      });

      if (response.ok) {
        setStatusMessage('Location sent successfully!');
        setLastSent(new Date());
        Alert.alert('Success', 'Location sent to ESP32');
        return true;
      } else {
        setStatusMessage('Failed to send location');
        Alert.alert('Error', 'Failed to send location to ESP32');
        return false;
      }
    } catch (error) {
      setStatusMessage(`Send error: ${error.message}`);
      Alert.alert('Error', `Failed to send: ${error.message}`);
      return false;
    } finally {
      setIsSending(false);
    }
  };

  const handleLocationFetch = async () => {
    try {
      const coords = await getLocation();
      if (coords) {
        await sendLocationToESP32(coords);
      }
    } catch (error) {
      console.error('Location fetch error:', error);
    }
  };

  const handleManualSend = async () => {
    const connected = await checkConnection();
    if (!connected) {
      Alert.alert('Not Connected', 'Please connect to ESP32 WiFi (192.168.4.1)');
      return;
    }
    await handleLocationFetch();
  };

  const getStatusColor = () => {
    if (wsStatus === 'connected') return '#10b981';
    if (wsStatus === 'error') return '#ef4444';
    return '#6b7280';
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
         
          <View>
            <Text style={styles.headerTitle}>Geo Tracker</Text>
            <Text style={styles.headerSubtitle}>ESP32 Location Bridge</Text>
          </View>
        </View>

        {/* Connection Status Card */}
        <View style={styles.card}>
          <View style={styles.connectionRow}>
            <View style={styles.connectionInfo}>
            
              <View>
                <Text style={styles.connectionLabel}>ESP32 Status</Text>
                <Text style={styles.connectionIP}>{ESP32_IP}</Text>
              </View>
            </View>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          </View>
          
          <View style={styles.statusMessageContainer}>
            <Text style={styles.statusMessage}>{statusMessage}</Text>
          </View>
        </View>

        {/* Location Display Card */}
        {location && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}> Current Location</Text>
            
            <View style={styles.locationItem}>
              <Text style={styles.locationLabel}>Latitude</Text>
              <Text style={styles.locationValue}>
                {location.latitude.toFixed(6)}°
              </Text>
            </View>
            
            <View style={styles.locationItem}>
              <Text style={styles.locationLabel}>Longitude</Text>
              <Text style={styles.locationValue}>
                {location.longitude.toFixed(6)}°
              </Text>
            </View>
            
            <View style={styles.locationItem}>
              <Text style={styles.locationLabel}>Accuracy</Text>
              <Text style={styles.locationValue}>
                ±{location.accuracy.toFixed(1)}m
              </Text>
            </View>

            {lastSent && (
              <View style={styles.lastSentContainer}>
                <Text style={styles.lastSentText}>
                  Last sent: {lastSent.toLocaleTimeString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={getLocation}
            disabled={isGettingLocation}
          >
            {isGettingLocation ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonIcon}></Text>
                <Text style={styles.buttonText}>Get My Location</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              (!location || isSending) && styles.disabledButton,
            ]}
            onPress={handleManualSend}
            disabled={!location || isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonIcon}></Text>
                <Text style={styles.buttonText}>
                  {isSending ? 'Sending...' : 'Send to ESP32'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            onPress={checkConnection}
          >
            <Text style={styles.buttonIcon}></Text>
            <Text style={styles.outlineButtonText}>Check Connection</Text>
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            1. Connect to ESP32 WiFi (192.168.4.1){'\n'}
            2. Get your location using GPS{'\n'}
            3. Send location to ESP32{'\n'}
            4. ESP32 button press triggers auto-send
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerIconText: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  connectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  connectionLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  connectionIP: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusMessageContainer: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
  },
  statusMessage: {
    fontSize: 14,
    color: '#4b5563',
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  locationValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  lastSentContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  lastSentText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  buttonsContainer: {
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  secondaryButton: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  disabledButton: {
    backgroundColor: '#d1d5db',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#3b82f6',
    lineHeight: 22,
  },
});

export default App;