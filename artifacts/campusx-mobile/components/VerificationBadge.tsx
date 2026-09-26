import React, { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

type BadgeType = "blue" | "green" | "green-circle" | "rounded" | "gold";
type BadgeKind = "student" | "business";

interface VerificationBadgeProps {
  size?: "sm" | "md" | "lg";
  fontSize?: number;
  type?: BadgeType;
  kind?: BadgeKind;
  placement?: "inline" | "avatar";
  glow?: boolean;
}

const SCALLOPED_EDGE = "M12 1.5 14.2 3.2 17 2.6 18.3 5.2 21.1 6.1 21 9 22.5 12 21 15 21.1 17.9 18.3 18.8 17 21.4 14.2 20.8 12 22.5 9.8 20.8 7 21.4 5.7 18.8 2.9 17.9 3 15 1.5 12 3 9 2.9 6.1 5.7 5.2 7 2.6 9.8 3.2Z";

export function VerificationBadge({
  size = "sm",
  fontSize,
  type = "blue",
  kind = "student",
  placement = "inline",
  glow = false,
}: VerificationBadgeProps) {
  const anchor = useRef<View>(null);
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const iconSize = Math.round((fontSize ?? { sm: 14, md: 17, lg: 22 }[size]) * (size === "lg" ? 1.1 : 1));
  const label = type === "green" || type === "green-circle" ? "Green Tick verification" : type === "blue" ? "Premium Blue Tick" : kind === "business" ? "Verified LASU CampusX Business" : "Verified Student Account";
  const color = type === "green" || type === "green-circle" ? "#22C55E" : type === "gold" ? "#FFD700" : type === "rounded" ? "#0095F6" : "#1DA1F2";

  const showTip = () => {
    if (tip) {
      setTip(null);
      return;
    }
    anchor.current?.measureInWindow((x, y, width, height) => {
      const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
      setTip({
        left: Math.max(8, Math.min(x + width / 2 - 123, screenWidth - 254)),
        top: y > 66 ? y - 44 : Math.min(y + height + 8, screenHeight - 48),
      });
    });
  };

  return (
    <>
      <View
        ref={anchor}
        collapsable={false}
        style={[
          placement === "avatar"
            ? { position: "absolute", right: 0, bottom: 0, marginLeft: 0, zIndex: 2 }
            : { marginLeft: 4, alignSelf: "center" },
          glow && { shadowColor: "#1DA1F2", shadowOpacity: 0.9, shadowRadius: 6, elevation: 5 },
        ]}
      >
        <Pressable
          onPress={showTip}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={8}
        >
          <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Defs>
              <LinearGradient id="badgeGold" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFF1A3" />
                <Stop offset="0.5" stopColor="#FFD700" />
                <Stop offset="1" stopColor="#C79116" />
              </LinearGradient>
            </Defs>
            {type === "rounded" || type === "green-circle"
              ? <Circle cx="12" cy="12" r="10.5" fill={color} />
              : <Path d={SCALLOPED_EDGE} fill={type === "gold" ? "url(#badgeGold)" : color} />}
            <Path d="m7.8 12.1 2.9 3 5.7-6" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      </View>
      <Modal visible={!!tip} transparent animationType="fade" onRequestClose={() => setTip(null)}>
        <Pressable onPress={() => setTip(null)} style={{ flex: 1 }}>
          {tip && (
            <View style={{
              position: "absolute", left: tip.left, top: tip.top, width: 246,
              paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9,
              backgroundColor: "#151926", borderWidth: 1, borderColor: "#404758",
              elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10,
            }}>
              <Text style={{ color: "#fff", textAlign: "center", fontSize: 12, fontWeight: "600" }}>{label}</Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}