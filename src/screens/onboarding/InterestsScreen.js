import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SPORTS = ['Football', 'Basketball', 'Tennis', 'Swimming', 'Running', 'Cycling', 'Yoga', 'Boxing', 'Golf', 'Rugby', 'Volleyball', 'Baseball', 'MMA', 'CrossFit', 'Hiking'];
const WELLNESS = ['Meditation', 'Nutrition', 'Sleep', 'Stretching', 'Breathing', 'Mental Health', 'Spa', 'Massage'];

export default function InterestsScreen({ navigation }) {
  const [selected, setSelected] = useState(['Cycling', 'Yoga']);

  const toggle = (item) => {
    if (selected.includes(item)) {
      setSelected(selected.filter(i => i !== item));
    } else {
      setSelected([...selected, item]);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>
      <Text style={styles.skip}>Skip →</Text>

      <Text style={styles.title}>Interested in?</Text>
      <Text style={styles.subtitle}>Choosing interests is recommended to personalize your experience.</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Text style={styles.sectionTitle}>Sports</Text>
        <View style={styles.tagsContainer}>
          {SPORTS.map((item) => (
            <TouchableOpacity key={item} style={[styles.tag, selected.includes(item) && styles.tagActive]} onPress={() => toggle(item)}>
              <Text style={[styles.tagText, selected.includes(item) && styles.tagTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Bien-être</Text>
        <View style={styles.tagsContainer}>
          {WELLNESS.map((item) => (
            <TouchableOpacity key={item} style={[styles.tag, selected.includes(item) && styles.tagActive]} onPress={() => toggle(item)}>
              <Text style={[styles.tagText, selected.includes(item) && styles.tagTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.dots}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
      </View>

      <LinearGradient colors={['#00cdb5', '#0066ac']} start={{x: 0, y: 0}} end={{x: 1, y: 0}} style={styles.btn}>
        <TouchableOpacity style={styles.btnInner} onPress={() => navigation.navigate('Guidelines')}>
          <Text style={styles.btnText}>Next →</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 30, paddingTop: 50 },
  back: { fontSize: 24, color: '#0a252f' },
  skip: { position: 'absolute', right: 30, top: 50, color: '#00cdb5', fontSize: 14 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 20, marginBottom: 10, color: '#0a252f' },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center', marginBottom: 20 },
  scroll: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 15, color: '#0a252f' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 25 },
  tag: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#CED3D5', borderRadius: 20, marginRight: 10, marginBottom: 10 },
  tagActive: { backgroundColor: '#00cdb5', borderColor: '#00cdb5' },
  tagText: { fontSize: 14, color: '#0a252f' },
  tagTextActive: { color: '#fff' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#CED3D5', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#00cdb5' },
  btn: { height: 56, borderRadius: 28, marginBottom: 30 },
  btnInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});