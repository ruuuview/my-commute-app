// app/index.tsx
import { View, Text } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex:1, backgroundColor:'red', justifyContent:'center', alignItems:'center' }}>
      <Text style={{ fontSize:40, color:'white', fontWeight:'bold' }}>ROUTER ALIVE</Text>
    </View>
  );
}
