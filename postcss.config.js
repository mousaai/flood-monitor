// PostCSS configuration for iOS Safari compatibility
// postcss-preset-env converts modern CSS (color-mix, oklch, @property) to fallbacks
module.exports = {
  plugins: {
    'postcss-preset-env': {
      // Stage 2 = widely supported features
      // Stage 1 = experimental features (color-mix, oklch)
      stage: 1,
      features: {
        // Convert oklch() to rgb() fallbacks for iOS Safari < 15.4
        'oklch-function': true,
        // Convert color-mix() to rgba() fallbacks for iOS Safari < 16.2
        'color-mix': true,
        // Convert @property to fallbacks for iOS Safari < 16.4
        'custom-properties': false, // Keep CSS variables as-is (they work on iOS 10+)
      },
      // Target iOS Safari 13+
      browsers: ['safari >= 13', 'ios_saf >= 13'],
    },
  },
};
