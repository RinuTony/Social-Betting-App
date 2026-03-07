import React from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';

export default function TopNav({ current, onChange }) {
  const tabs = ['Feed', 'Social', 'Wallet', 'Rewards'];

  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const active = tab === current;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            style={[styles.tab, active && styles.activeTab]}
          >
            <Text style={[styles.tabText, active && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#101A2B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#2947A9',
  },
  tabText: {
    color: '#98A6C5',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
});
