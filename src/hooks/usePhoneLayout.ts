import { useWindowDimensions } from 'react-native';
import { getPhoneLayout } from '../utils/phoneLayout';

export function usePhoneLayout(bottomInset = 0) {
  const { width, fontScale } = useWindowDimensions();
  return getPhoneLayout(width, fontScale, bottomInset);
}
