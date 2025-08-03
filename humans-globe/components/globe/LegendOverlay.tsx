"use client";

export default function LegendOverlay() {
  return (
    <div
      className="absolute bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white"
      style={{ top: '2rem', right: '2rem', zIndex: 30 }}
    >
      <div className="text-sm font-semibold mb-2 text-blue-300">Deep History</div>
      <div className="text-xs text-gray-400 mb-3">12,000 Years of Settlement</div>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-400" />
          <span>Human settlements</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400 opacity-60" />
          <span>Population density</span>
        </div>
        <div className="pt-2 border-t border-gray-700 mt-2">
          <div className="font-semibold mb-1">Dot Size</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span>Smaller population</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-400" />
            <span>Larger population</span>
          </div>
        </div>
      </div>
    </div>
  );
}
