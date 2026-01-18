import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, FORM } from '../../config/theme';
import { getInterests } from '../../services/database';

export default function InterestsScreen({ navigation }) {
  const [selected, setSelected] = useState([]);
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load interests from Supabase
  useEffect(() => {
    loadInterests();
  }, []);

  const loadInterests = async () => {
    setLoading(true);
    const { data, error } = await getInterests();
    if (data && !error) {
      setInterests(data);
    }
    setLoading(false);
  };

  const toggle = (item) => {
    if (selected.includes(item.id)) {
      setSelected(selected.filter(i => i !== item.id));
    } else {
      setSelected([...selected, item.id]);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.navigate('FindFriends')}>
        <Text style={styles.skip}>Skip →</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Interested in?</Text>
      <Text style={styles.subtitle}>Choosing interests is recommended to personalize your experience.</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Text style={styles.sectionTitle}>Sports</Text>
        <View style={styles.tagsContainer}>
          {interests.filter(i => i.category === 'sports').map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={[styles.tag, selected.includes(item.id) && styles.tagActive]} 
              onPress={() => toggle(item)}
            >
              <Text style={[styles.tagText, selected.includes(item.id) && styles.tagTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Wellness</Text>
        <View style={styles.tagsContainer}>
          {interests.filter(i => i.category === 'wellness').map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={[styles.tag, selected.includes(item.id) && styles.tagActive]} 
              onPress={() => toggle(item)}
            >
              <Text style={[styles.tagText, selected.includes(item.id) && styles.tagTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.dots}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
      </View>

      <LinearGradient 
        colors={GRADIENTS.primary} 
        start={GRADIENTS.primaryStart} 
        end={GRADIENTS.primaryEnd} 
        style={styles.btn}
      >
        <TouchableOpacity style={styles.btnInner} onPress={() => navigation.navigate('FindFriends')}>
          <Text style={styles.btnText}>Next →</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white, 
    paddingHorizontal: 30, 
    paddingTop: 50 
  },
  back: { 
    fontSize: 24, 
    color: COLORS.dark 
  },
  skipBtn: { 
    position: 'absolute', 
    right: 30, 
    top: 50 
  },
  skip: { 
    color: COLORS.primary, 
    fontSize: 14 
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginTop: 20, 
    marginBottom: 10, 
    color: COLORS.dark 
  },
  subtitle: { 
    fontSize: 14, 
    color: COLORS.gray, 
    textAlign: 'center', 
    marginBottom: 20 
  },
  scroll: { 
    flex: 1 
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '600', 
    marginBottom: 15, 
    color: COLORS.dark 
  },
  tagsContainer: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    marginBottom: 25 
  },
  tag: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderWidth: 1, 
    borderColor: COLORS.grayLight, 
    borderRadius: 20, 
    marginRight: 10, 
    marginBottom: 10 
  },
  tagActive: { 
    backgroundColor: COLORS.primary, 
    borderColor: COLORS.primary 
  },
  tagText: { 
    fontSize: 14, 
    color: COLORS.dark 
  },
  tagTextActive: { 
    color: COLORS.white 
  },
  dots: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginBottom: 20 
  },
  dot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: COLORS.grayLight, 
    marginHorizontal: 4 
  },
  dotActive: { 
    backgroundColor: COLORS.primary 
  },
  btn: { 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius, 
    marginBottom: 30 
  },
  btnInner: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  btnText: { 
    color: COLORS.white, 
    fontSize: 16, 
    fontWeight: '600' 
  },
});
