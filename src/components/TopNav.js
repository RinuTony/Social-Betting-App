import React from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';

export default function TopNav({ current, onChange }) {
  const tabs = [
    { key: 'Feed', icon: '◉' },
    { key: 'My Bets', icon: '◎' },
    { key: 'Social', icon: '◌' },
    { key: 'Profiles', icon: '◍' },
    { key: 'Wallet', icon: '◈' },
    { key: 'Rewards', icon: '✦' },
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
            <Text style={[styles.tabText, active && styles.activeTabText]}>{tab.key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18, 18, 22, 0.74)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(0, 255, 136, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.42)',
  },
  icon: {
    color: '#7A7A90',
    fontSize: 12,
    marginBottom: 2,
  },
  activeIcon: {
    color: '#8B5CF6',
  },
  tabText: {
    color: '#A3A3B7',
    fontWeight: '600',
    fontSize: 10,
  },
  activeTabText: {
    color: '#00FF88',
  },
});


