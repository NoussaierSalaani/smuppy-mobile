// SMUPPY Components Library
// Export all reusable components

export { default as Button } from './Button';
export { default as Input } from './Input';
export { default as Card } from './Card';
export { default as Avatar } from './Avatar';
export { default as Header } from './Header';
export { default as Tag } from './Tag';
export { default as Toggle } from './Toggle';
export { default as TabBar } from './TabBar';
export { default as BottomNav } from './BottomNav';
export { default as ErrorBoundary } from './ErrorBoundary';
export { 
  default as SmuppyLogo, 
  SmuppyIcon, 
  SmuppyText, 
  SmuppyLogoFull,
  SmuppyLogoStacked 
} from './SmuppyLogo';

// Usage examples:
// import { Button, Input, Card, SmuppyLogo } from '../components';
// 
// Logo variants:
// <SmuppyIcon size={80} variant="gradient" />          // Icon with gradient bg
// <SmuppyIcon size={80} variant="white" />             // Icon with white bg
// <SmuppyText width={100} variant="gradient" />        // Text in green/cyan
// <SmuppyText width={100} variant="dark" />            // Text in dark blue
// <SmuppyText width={100} variant="white" />           // Text in white
// <SmuppyLogoFull iconSize={50} textWidth={120} />     // Icon + text side by side
// <SmuppyLogoStacked iconSize={80} textWidth={100} />  // Icon above text