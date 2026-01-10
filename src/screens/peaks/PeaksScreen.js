import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PeaksScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Peaks</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
});