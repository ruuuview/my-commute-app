import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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
  const [localLines, setLocalLines] = useState<string[]>(savedLines);

  useEffect(() => { if (visible) setLocalLines(savedLines); }, [visible, savedLines]);

  const toggleLine = (id: string) => {
    if (localLines.includes(id)) setLocalLines(localLines.filter(l => l !== id));
    else setLocalLines([...localLines, id]);
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
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionHeader}>Select Lines</Text>
          {Object.values(allLines).map((line: any) => (
            <TouchableOpacity key={line.id} style={styles.row} onPress={() => toggleLine(line.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.dot, { backgroundColor: line.color }]} />
                <Text style={styles.lineName}>{line.name}</Text>
              </View>
              {localLines.includes(line.id) && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveText}>Save Changes</Text></TouchableOpacity>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f2f2f7', paddingTop: 20 }, header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' }, title: { fontSize: 24, fontWeight: '700' }, content: { padding: 20 }, sectionHeader: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#666' }, row: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', marginBottom: 8, borderRadius: 12, alignItems: 'center' }, dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 }, lineName: { fontSize: 16, fontWeight: '500' }, saveBtn: { margin: 20, backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 40 }, saveText: { color: 'white', fontWeight: '700', fontSize: 18 } });