import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP_ID = "group.com.mycommute.app";

interface WidgetData {
  lineName: string;
  status: string;
  updatedAt: string;
  severity: number;
}

export const syncToWidget = async (data: WidgetData): Promise<void> => {
  try {
    await SharedGroupPreferences.setItem(
      "tubeStatus",
      JSON.stringify(data),
      APP_GROUP_ID
    );
    console.log("Widget synced:", data.lineName);
  } catch (error) {
    console.log("Widget sync failed:", error);
  }
};

export const getWidgetData = async (): Promise<WidgetData | null> => {
  try {
    const data = await SharedGroupPreferences.getItem("tubeStatus", APP_GROUP_ID);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
};
