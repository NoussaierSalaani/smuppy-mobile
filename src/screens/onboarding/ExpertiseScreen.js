import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const EXPERTISE_CATEGORIES = [
  {
    title: 'Coachs & Experts Sportifs',
    items: ['Personal Trainer', 'Coach Sportif', 'Nutrition Coach', 'Physical Trainer', 'Physiotherapist', 'Mental Coach', 'Rehabilitation Specialist']
  },
  {
    title: 'AI & Intelligence Artificielle',
    items: ['AI Coach & Performance Tracking', 'Sports Analyst AI & Big Data', 'Virtual Assistant Developer', 'Wearables & Biometric Sensors']
  },
  {
    title: 'Biohacking & Body Optimization',
    items: ['Biohacking Expert', 'Physical Performance Expert', 'Regenerative Medicine', 'Cognitive Enhancement', 'Neurostimulation Coach']
  },
  {
    title: 'Sport & Handicap / Inclusion',
    items: ['Adaptive Sports Coach', 'Paralympic Games Org', 'Engineering for Disability Sports', 'Inclusive Sports Associations']
  }
];

export default function ExpertiseScreen({ navigation }) {
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);

  const toggle = (item) => {
    if (selected.includes(item)) {
      setSelected(selected.filter(i => i !== item));
    } else {
      setSelected([...selected, item]);
    }
  };

  const currentCategory = EXPERTISE_CATEGORIES[currentPage];

  const handleNext = () => {
    if (currentPage < EXPERTISE_CATEGORIES.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      navigation.navigate('Interests');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => currentPage > 0 ? setCurrentPage(currentPage - 1) : navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Area of expertise</Text>
      <Text style={styles.subtitle}>Describe your area of expertise or the primary domain of your business or interest</Text>

      <Text style={styles.categoryTitle}>{currentCategory.title}</Text>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.tagsContainer}>
          {currentCategory.items.map((item) => (
            <TouchableOpacity 
              key={item} 
              style={[styles.tag, selected.includes(item) && styles.tagActive]} 
              onPress={() => toggle(item)}
            >
              <Text style={[styles.tagText, selected.includes(item) && styles.tagTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.dots}>
        {EXPERTISE_CATEGORIES.map((_, index) => (
          <View key={index} style={[styles.dot, currentPage === index && styles.dotActive]} />
        ))}
      </View>

      <LinearGradient colors={['#00cdb5', '#0066ac']} start={{x: 0, y: 0}} end={{x: 1, y: 0}} style={styles.btn}>
        <TouchableOpacity style={styles.btnInner} onPress={handleNext}>
          <Text style={styles.btnText}>{currentPage < EXPERTISE_CATEGORIES.length - 1 ? 'Next →' : 'To end →'}</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 30, paddingTop: 50 },
  back: { fontSize: 24, color: '#0a252f', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#0a252f', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#676C75', marginBottom: 20 },
  categoryTitle: { fontSize: 18, fontWeight: '600', color: '#00cdb5', marginBottom: 20 },
  scroll: { flex: 1 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#CED3D5', borderRadius: 25, marginRight: 10, marginBottom: 12 },
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