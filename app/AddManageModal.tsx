import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLines } from '../store/lineDataStore';

interface AddManageModalProps {
  visible: boolean;
  onClose: () => void;
  savedLines: string[];
  savedStations: string[];
  onSave: (lines: string[], stations: string[]) => void;
}

export default function AddManageModal({ visible, onClose, savedLines, savedStations, onSave }: AddManageModalProps) {
  const allLines = useLines();
  const [localLines, setLocalLines] = useState<string[]>([]);
  const prevVisible = useRef(visible);

  if (visible !== prevVisible.current) {
    prevVisible.current = visible;
    if (visible) {
      setLocalLines(savedLines);
    }
  }

  const toggleLine = (id: string) => {
    setLocalLines(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const handleSave = () => { 
    if (typeof onSave === 'function') onSave(localLines, savedStations); 
    if (typeof onClose === 'function') onClose(); 
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Manage Commute</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={28} color="#333" /></Pressable>
        </View>
        <FlatList
          contentContainerStyle={styles.content}
          ListHeaderComponent={<Text style={styles.sectionHeader}>Select Lines</Text>}
          data={Object.values(allLines) as any[]}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item: line }) => (
            <Pressable style={styles.row} onPress={() => toggleLine(line.id)}>
              <View style={styles.rowContent}>
                <View style={[styles.dot, { backgroundColor: line.color }]} />
                <Text style={styles.lineName}>{line.name}</Text>
              </View>
              {localLines.includes(line.id) && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
            </Pressable>
          )}
        />
        <Pressable style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveText}>Save Changes</Text></Pressable>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f2f2f7', paddingTop: 20 }, header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' }, title: { fontSize: 24, fontWeight: '700' }, content: { padding: 20 }, sectionHeader: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#666' }, row: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', marginBottom: 8, borderRadius: 12, alignItems: 'center' }, rowContent: { flexDirection: 'row', alignItems: 'center' }, dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 }, lineName: { fontSize: 16, fontWeight: '500' }, saveBtn: { margin: 20, backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 40 }, saveText: { color: 'white', fontWeight: '700', fontSize: 18 } });