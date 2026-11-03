import { createTheme } from '@mui/material/styles';

// Phase 2: Only previously approved tokens; visual components await UX input.
const theme = createTheme({
  palette: {
    primary: { main: '#792b40' },
    background: { default: '#faf9f6', paper: '#ffffff' },
    text: { primary: '#1d1d1d' },
  },
  typography: {
    fontFamily: '"Roboto Mono", monospace',
    button: { fontFamily: '"Roboto Mono", monospace', fontWeight: 500, textTransform: 'none' },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { minHeight: 66, height: 66, borderRadius: 6 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { height: 66, width: 66 },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: 16, fontWeight: 500 },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: { fontSize: 16, fontWeight: 500 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          '&:not(.MuiInputBase-multiline)': { height: 48 },
        },
      },
    },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 6 } } },
  },
});

export default theme;
