// Accent text and filled buttons have separate tokens so white button labels
// remain readable when dark mode uses brighter link/status colors.
export const lightColors = {
  primary: '#2563EB', primarySolid: '#2563EB',
  background: '#F7F8FA', surface: '#FFFFFF', surfaceDark: '#18181B',
  surfaceMuted: '#F1F3F6', primarySoft: '#EFF6FF', primarySelected: '#EDF4FF',
  successSoft: '#F0FDF4', dangerSoft: '#FEF2F2', dangerBorder: '#FECACA',
  text: '#18181B', textSecondary: '#596273', textMuted: '#616B7B',
  textInverse: '#FFFFFF', heroMuted: '#BCC9DE',
  border: '#D8DEE8', switchTrack: '#93C5FD',
  success: '#15803D', danger: '#C62828', warning: '#946200',
  expense: '#C62828', income: '#15803D', transfer: '#2563EB',
  expenseSolid: '#C62828', incomeSolid: '#15803D',
};

export type ThemeColors = { [Key in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  primary: '#8EB8FF', primarySolid: '#2563EB',
  background: '#0D1420', surface: '#172131', surfaceDark: '#112644',
  surfaceMuted: '#202C3D', primarySoft: '#1A3151', primarySelected: '#1C3658',
  successSoft: '#133A2B', dangerSoft: '#40202A', dangerBorder: '#9E4658',
  text: '#F3F6FC', textSecondary: '#BAC6D8', textMuted: '#9BAAC0',
  textInverse: '#FFFFFF', heroMuted: '#BCC9DE',
  border: '#35455B', switchTrack: '#315C96',
  success: '#6FE0A3', danger: '#FF9CA9', warning: '#F6CD76',
  expense: '#FF9CA9', income: '#6FE0A3', transfer: '#8EB8FF',
  expenseSolid: '#C62828', incomeSolid: '#15803D',
};
