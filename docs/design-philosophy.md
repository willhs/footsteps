# Footsteps of Time: Design Philosophy & System

## 1. Design Philosophy

### Vision

I want this to be an experience where users can easily explore where humans were and how they lived. It should be satisfying i.e. get quick feedback e.g. panning and zooming on the map/globe should be smooth and quick.

I want to show where humans were at any point in time in history, ideally as far back as 100k BC. 

It should be an instantiation of the avilable data on history - that is it should always show where humans were at any time, ideally down to every human on earth, performance permitting. The aim is to be as accurate as possible as we integrate with more data sets / anthropology data.

### Design Principles

#### Core Principle: Data-Driven Minimalism

Footsteps of Time follows Edward Tufte's principle of **"data ink"** – every pixel serves the purpose of communicating historical data. We eliminate "chartjunk" and visual decoration that doesn't advance understanding of human settlement patterns across deep time.

Note that in footsteps we're working with incomplete data so ink may be also be used to tell the story where we believe data could exist, in addition to human locations based on hard data.

#### Storytelling with Data 

Transform "dry demographic tables into a visceral, time-lapse journey" by prioritizing:
- **Immediate impact**: The first 3 seconds should convey the scale of human expansion
- **Intuitive interaction**: Dragging should feel like controlling time itself
- **Historical empathy**: Each dot represents real people living their lives

#### The Anti-Duck Principle

We consciously avoid Tufte's "duck" – where aesthetic considerations overpower the story the data tells. The globe itself becomes invisible; users see humanity spreading, not interface elements.


## 2. Visual Design System

### Color Palette

#### Primary Colors
- **Deep Space Black**: `#0a0a0a` - Background represents the void of space/time
- **Human Orange**: `#f97316` - Population dots (warmth = life)
- **Time Blue**: `#0ea5e9` - Interactive elements, current year, active states
- **Ancient Cyan**: `#38bdf8` - Highlights, selected states, accents

#### Semantic Colors
- **Loading/Uncertainty**: `#6b7280` - Gray for unknown or loading states
- **Success/Data**: `#10b981` - Green for successful data loads
- **Warning/Synthetic**: `#f59e0b` - Amber for uncertain/synthetic data
- **Error/Missing**: `#ef4444` - Red for errors or missing data

#### Globe Colors
- **Land Mass**: `rgba(40, 60, 80, 0.14)` - Subtle blue-gray continents
- **Ocean**: Transparent - Let the space backdrop show through
- **Terrain Base**: Natural Earth satellite imagery (when loaded)

### Typography

#### Primary Font Stack
```css
font-family: Arial, Helvetica, sans-serif;
```

**Rationale**: Maximum readability across all devices and languages. No custom fonts to avoid loading delays that interrupt the visceral first impression.

#### Hierarchy
- **Mega (24px, bold)**: Current year display - the hero element
- **Large (18px, bold)**: Section headers, key metrics
- **Body (14px, normal)**: Most interface text
- **Small (12px)**: Secondary information, debug data
- **Tiny (10px)**: Slider labels on mobile

### Spacing & Layout

#### Z-Index Strategy
- **50**: Critical overlays (error states)
- **40**: Time slider (always accessible)
- **30**: Data overlays (can be hidden)
- **20**: View mode toggle
- **10**: Secondary controls
- **0**: Globe and visualization layers

#### Responsive Breakpoints
- **Mobile**: `< 640px` - Compact labels, simplified interface
- **Tablet**: `640px - 1024px` - Full interface, optimized touch targets
- **Desktop**: `> 1024px` - Full feature set, hover states

---

## 3. UI/UX Design Conventions

### Interaction Paradigms

#### Primary Interaction: Time Travel
The time slider is the **hero interaction** - everything else supports this core experience:
- **Immediate response**: No loading delays during scrubbing (pre-cached data)

#### Progressive Disclosure
- **Immediate**: Globe + time slider + current year
- **On hover**: Dot population details, place names
- **On zoom**: Increased detail level (LOD), city names
- **Debug mode**: Performance metrics, cache status (development only)

## 5. Performance Design Philosophy

### 60fps Interaction Standard

Every interaction must maintain 60fps on target hardware (MacBook M3, iPhone 12+):

### Perceived Performance

#### Loading States
- **Immediate feedback**: Skeleton states appear instantly
- **Progressive disclosure**: Show what's ready, load the rest
- **Smooth transitions**: No jarring content shifts

#### Cache Strategy
Use caching where possible to reduce latency and network usage

### Data Transfer Optimization

#### Server-Side Filtering
- **Viewport culling**: Only send dots in visible area (60-90% reduction)
- **LOD selection**: Automatic detail level based on zoom
- **Compressed format**: Gzip + NDJSON for streaming efficiency
