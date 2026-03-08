import React from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';

export default function TopNav({ current, onChange }) {
  const tabs = [
    { key: 'Home', icon: 'H', label: 'Home' },
    { key: 'Commitments', icon: 'C', label: 'Commit' },
    { key: 'Leaderboard', icon: 'L', label: 'Leaders' },
    { key: 'Notifications', icon: 'N', label: 'Alerts' },
    { key: 'Profile', icon: 'P', label: 'Profile' },
  ];

  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, active && styles.activeTab]}
          >
            <Text style={[styles.icon, active && styles.activeIcon]}>{tab.icon}</Text>
            <Text style={[styles.tabText, active && styles.activeTabText]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(22, 18, 36, 0.94)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.28)',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 7,
  },
  activeTab: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  icon: {
    color: '#8E87A6',
    fontSize: 11,
    marginBottom: 2,
    fontWeight: '700',
  },
  activeIcon: {
    color: '#C5B8FF',
  },
  tabText: {
    color: '#A7A0C2',
    fontWeight: '600',
    fontSize: 10,
  },
  activeTabText: {
    color: '#F2EFFF',
  },
});
