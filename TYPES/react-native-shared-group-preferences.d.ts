declare module 'react-native-shared-group-preferences' {
  export default class SharedGroupPreferences {
    static setItem(
      key: string, 
      value: any, 
      appGroupIdentifier: string
    ): Promise<void>;
    
    static getItem(
      key: string, 
      appGroupIdentifier: string
    ): Promise<any>;
    
    static removeItem(
      key: string, 
      appGroupIdentifier: string
    ): Promise<void>;
  }
}