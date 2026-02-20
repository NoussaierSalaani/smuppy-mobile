import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { GradeName, getGradeColors } from '../utils/gradeSystem';

type GradeFrameProps = Readonly<{
  grade: GradeName;
  color: string;
  size: number;
  children: React.ReactNode;
}>;

type FrameProps = Readonly<{
  color: string;
  size: number;
  uid: string;
}>;

const FRAME_PADDING = 8;
const HEX_SIDES = 6;
const ACCENT_ANGLE_OFFSET = 0.3;
const ACCENT_LENGTH = 6;

let frameIdCounter = 0;

function buildHexPath(cx: number, cy: number, radius: number): string {
  const points = Array.from({ length: HEX_SIDES }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = Math.round((cx + radius * Math.cos(angle)) * 100) / 100;
    const y = Math.round((cy + radius * Math.sin(angle)) * 100) / 100;
    return { x, y };
  });
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
}

function buildHexAccents(cx: number, cy: number, radius: number): string {
  return Array.from({ length: HEX_SIDES }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    const a1 = angle - ACCENT_ANGLE_OFFSET;
    const a2 = angle + ACCENT_ANGLE_OFFSET;
    return `M${px},${py} L${px + ACCENT_LENGTH * Math.cos(a1)},${py + ACCENT_LENGTH * Math.sin(a1)} L${px + ACCENT_LENGTH * Math.cos(a2)},${py + ACCENT_LENGTH * Math.sin(a2)} Z`;
  }).join(' ');
}

const ChampionFrame = React.memo(({ color, size, uid }: FrameProps) => {
  const { primary, glow } = getGradeColors(color);
  const s = size + FRAME_PADDING * 2;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 2;
  const rInner = r - 4;
  const glowId = `champGlow_${uid}`;

  const outerHex = buildHexPath(cx, cy, r);
  const innerHex = buildHexPath(cx, cy, rInner);
  const accents = buildHexAccents(cx, cy, r + 3);

  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Defs>
        <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <Stop offset="0.7" stopColor={glow} stopOpacity="0" />
          <Stop offset="1" stopColor={glow} stopOpacity="0.4" />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r + 4} fill={`url(#${glowId})`} />
      <Path d={outerHex} fill="none" stroke={primary} strokeWidth={2.5} />
      <Path d={innerHex} fill="none" stroke={primary} strokeWidth={1} strokeOpacity={0.5} />
      <Path d={accents} fill={primary} />
    </Svg>
  );
});

const EliteFrame = React.memo(({ color, size, uid }: FrameProps) => {
  const { primary, glow } = getGradeColors(color);
  const s = size + FRAME_PADDING * 2;
  const cx = s / 2;
  const cy = s / 2;
  const top = 2;
  const bottom = s - 2;
  const left = 2;
  const right = s - 2;
  const midY = s * 0.6;
  const glowId = `eliteGlow_${uid}`;

  const shield = `M${cx},${top} L${right},${top + 10} L${right},${midY} Q${right},${bottom - 10} ${cx},${bottom} Q${left},${bottom - 10} ${left},${midY} L${left},${top + 10} Z`;
  const wingL = `M${left - 2},${s * 0.3} Q${left - 8},${s * 0.45} ${left},${s * 0.55}`;
  const wingR = `M${right + 2},${s * 0.3} Q${right + 8},${s * 0.45} ${right},${s * 0.55}`;

  return (
    <Svg width={s + 12} height={s} viewBox={`-6 0 ${s + 12} ${s}`}>
      <Defs>
        <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <Stop offset="0.6" stopColor={glow} stopOpacity="0" />
          <Stop offset="1" stopColor={glow} stopOpacity="0.5" />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={s / 2 + 2} fill={`url(#${glowId})`} />
      <Path d={shield} fill="none" stroke={primary} strokeWidth={3} />
      <Path d={shield} fill="none" stroke={primary} strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3" />
      <Path d={wingL} fill="none" stroke={primary} strokeWidth={2} strokeLinecap="round" />
      <Path d={wingR} fill="none" stroke={primary} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
});

const GoatFrame = React.memo(({ color, size, uid }: FrameProps) => {
  const { primary, glow } = getGradeColors(color);
  const s = size + FRAME_PADDING * 2;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 4;
  const glowId = `goatGlow_${uid}`;

  const crownBase = 6;
  const crownH = 14;
  const crownW = s * 0.6;
  const crownLeft = cx - crownW / 2;
  const crownRight = cx + crownW / 2;
  const crown = [
    `M${crownLeft},${crownBase + crownH}`,
    `L${crownLeft},${crownBase + 4}`,
    `L${crownLeft + crownW * 0.2},${crownBase}`,
    `L${cx - crownW * 0.1},${crownBase + 6}`,
    `L${cx},${crownBase - 4}`,
    `L${cx + crownW * 0.1},${crownBase + 6}`,
    `L${crownRight - crownW * 0.2},${crownBase}`,
    `L${crownRight},${crownBase + 4}`,
    `L${crownRight},${crownBase + crownH}`,
  ].join(' ');

  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Defs>
        <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <Stop offset="0.5" stopColor={glow} stopOpacity="0" />
          <Stop offset="0.8" stopColor={glow} stopOpacity="0.3" />
          <Stop offset="1" stopColor={glow} stopOpacity="0.6" />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r + 8} fill={`url(#${glowId})`} />
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={primary} strokeWidth={3.5} />
      <Circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={primary} strokeWidth={1} strokeOpacity={0.4} />
      <Path d={crown} fill="none" stroke={primary} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d={crown} fill={primary} fillOpacity={0.2} />
    </Svg>
  );
});

const FRAME_COMPONENTS: Record<GradeName, React.FC<FrameProps>> = {
  champion: ChampionFrame,
  elite: EliteFrame,
  goat: GoatFrame,
};

const GradeFrame: React.FC<GradeFrameProps> = ({ grade, color, size, children }) => {
  const FrameComponent = FRAME_COMPONENTS[grade];
  const frameSize = size + FRAME_PADDING * 2;

  const uid = useMemo(() => {
    frameIdCounter += 1;
    return String(frameIdCounter);
  }, []);

  const containerStyle = useMemo(() => ({
    width: frameSize,
    height: frameSize,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }), [frameSize]);

  const childWrapStyle = useMemo(() => ({
    width: size,
    height: size,
  }), [size]);

  return (
    <View style={containerStyle}>
      <View style={StyleSheet.absoluteFill}>
        <FrameComponent color={color} size={size} uid={uid} />
      </View>
      <View style={childWrapStyle}>
        {children}
      </View>
    </View>
  );
};

export default React.memo(GradeFrame);
