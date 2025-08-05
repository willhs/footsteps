#!/usr/bin/env python3
"""
Settlement Registry for maintaining consistent settlement positions across years.
Implements deterministic geographic positioning to create visual continuity in time-lapse data.
"""

import hashlib
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from models import Coordinates


@dataclass
class SettlementPosition:
    """Represents a consistent settlement position within a geographic cell."""
    coordinates: Coordinates
    cell_id: str
    position_index: int  # Index within the cell (for multiple settlements per cell)
    
    
class SettlementRegistry:
    """
    Registry for maintaining consistent settlement positions across different years.
    Uses geographic hashing to ensure same locations generate same settlement positions.
    """
    
    def __init__(self):
        self._position_cache: Dict[str, List[SettlementPosition]] = {}
        self._geo_hash_precision = 6  # Number of decimal places for coordinate hashing
    
    def get_geographic_cell_id(self, lat: float, lon: float, cellsize: float, settlement_type: str = "rural") -> str:
        """
        Generate a consistent cell identifier based on geographic coordinates and settlement type.
        
        Args:
            lat, lon: Center coordinates of the cell
            cellsize: Size of the cell in degrees
            settlement_type: Type of settlement (affects positioning pattern)
            
        Returns:
            Unique string identifier for this geographic cell and settlement type
        """
        # Round coordinates to cell boundaries for consistency
        cell_lat = round(lat / cellsize) * cellsize
        cell_lon = round(lon / cellsize) * cellsize
        
        # Create stable hash from rounded coordinates and settlement type
        coord_str = f"{cell_lat:.{self._geo_hash_precision}f},{cell_lon:.{self._geo_hash_precision}f},{cellsize:.6f},{settlement_type}"
        return hashlib.md5(coord_str.encode()).hexdigest()[:12]
    
    def get_deterministic_positions(
        self, 
        lat: float, 
        lon: float, 
        cellsize: float, 
        num_positions: int,
        settlement_type: str = "rural"
    ) -> List[SettlementPosition]:
        """
        Get consistent settlement positions for a geographic cell.
        
        Args:
            lat, lon: Center coordinates of the cell
            cellsize: Size of the cell in degrees
            num_positions: Number of settlement positions needed
            settlement_type: Type of settlement (rural, town, city) affects distribution pattern
            
        Returns:
            List of consistent settlement positions
        """
        cell_id = self.get_geographic_cell_id(lat, lon, cellsize, settlement_type)
        
        # Check cache first
        if cell_id in self._position_cache:
            cached_positions = self._position_cache[cell_id]
            if len(cached_positions) >= num_positions:
                return cached_positions[:num_positions]
        
        # Generate new positions deterministically
        positions = self._generate_deterministic_positions(
            lat, lon, cellsize, num_positions, cell_id, settlement_type
        )
        
        # Cache the results
        self._position_cache[cell_id] = positions
        return positions
    
    def _generate_deterministic_positions(
        self,
        lat: float,
        lon: float, 
        cellsize: float,
        num_positions: int,
        cell_id: str,
        settlement_type: str
    ) -> List[SettlementPosition]:
        """
        Generate deterministic settlement positions using geographic seeding.
        
        Args:
            lat, lon: Center coordinates of the cell
            cellsize: Size of the cell in degrees
            num_positions: Number of positions to generate
            cell_id: Unique identifier for this cell
            settlement_type: Type of settlement affecting distribution pattern
            
        Returns:
            List of deterministic settlement positions
        """
        # Create deterministic seed from cell coordinates
        seed = int(hashlib.md5(cell_id.encode()).hexdigest()[:8], 16) % (2**31)
        rng = np.random.RandomState(seed)
        
        positions = []
        
        if settlement_type == "rural" or num_positions <= 3:
            # Rural areas: Use random-like distribution but deterministic
            for i in range(num_positions):
                # Use different seed for each position to avoid clustering
                position_seed = (seed + i * 1007) % (2**31)  # 1007 is prime
                pos_rng = np.random.RandomState(position_seed)
                
                offset_lat = pos_rng.uniform(-cellsize/2, cellsize/2)
                offset_lon = pos_rng.uniform(-cellsize/2, cellsize/2)
                
                settlement_lat = lat + offset_lat
                settlement_lon = lon + offset_lon
                
                # Ensure coordinates are valid
                settlement_lat = max(-90, min(90, settlement_lat))
                settlement_lon = max(-180, min(180, settlement_lon))
                
                position = SettlementPosition(
                    coordinates=Coordinates(longitude=settlement_lon, latitude=settlement_lat),
                    cell_id=cell_id,
                    position_index=i
                )
                positions.append(position)
                
        elif settlement_type == "town":
            # Towns: Semi-systematic grid with deterministic offsets
            grid_size = int(np.ceil(np.sqrt(num_positions)))
            grid_step = cellsize / (grid_size + 1)  # Add padding
            
            position_idx = 0
            for i in range(grid_size):
                for j in range(grid_size):
                    if position_idx >= num_positions:
                        break
                        
                    # Grid position
                    offset_lat = (i - grid_size/2 + 0.5) * grid_step
                    offset_lon = (j - grid_size/2 + 0.5) * grid_step
                    
                    # Add deterministic but random-looking offset
                    offset_seed = (seed + position_idx * 2017) % (2**31)  # 2017 is prime
                    offset_rng = np.random.RandomState(offset_seed)
                    
                    offset_lat += offset_rng.uniform(-grid_step/4, grid_step/4)
                    offset_lon += offset_rng.uniform(-grid_step/4, grid_step/4)
                    
                    settlement_lat = lat + offset_lat
                    settlement_lon = lon + offset_lon
                    
                    # Ensure coordinates are valid
                    settlement_lat = max(-90, min(90, settlement_lat))
                    settlement_lon = max(-180, min(180, settlement_lon))
                    
                    position = SettlementPosition(
                        coordinates=Coordinates(longitude=settlement_lon, latitude=settlement_lat),
                        cell_id=cell_id,
                        position_index=position_idx
                    )
                    positions.append(position)
                    position_idx += 1
                    
        else:  # city
            # Cities: Fixed relative positions within cell
            fixed_positions = [
                (0, 0),           # Center
                (-0.25, -0.25),   # Southwest
                (0.25, -0.25),    # Southeast
                (-0.25, 0.25),    # Northwest
                (0.25, 0.25),     # Northeast
            ]
            
            for i in range(min(num_positions, len(fixed_positions))):
                offset_lat, offset_lon = fixed_positions[i]
                settlement_lat = lat + offset_lat * cellsize
                settlement_lon = lon + offset_lon * cellsize
                
                # Ensure coordinates are valid
                settlement_lat = max(-90, min(90, settlement_lat))
                settlement_lon = max(-180, min(180, settlement_lon))
                
                position = SettlementPosition(
                    coordinates=Coordinates(longitude=settlement_lon, latitude=settlement_lat),
                    cell_id=cell_id,
                    position_index=i
                )
                positions.append(position)
        
        return positions
    
    def clear_cache(self):
        """Clear the position cache to free memory."""
        self._position_cache.clear()
    
    def get_cache_stats(self) -> Dict[str, int]:
        """Get statistics about the position cache."""
        total_positions = sum(len(positions) for positions in self._position_cache.values())
        return {
            "cached_cells": len(self._position_cache),
            "total_cached_positions": total_positions,
            "memory_usage_estimate_kb": (len(self._position_cache) * 50 + total_positions * 30) // 1024
        }
    
    def validate_position_consistency(
        self, 
        lat: float, 
        lon: float, 
        cellsize: float, 
        num_positions: int,
        settlement_type: str = "rural"
    ) -> bool:
        """
        Validate that getting positions multiple times returns identical results.
        
        Args:
            lat, lon: Center coordinates of the cell
            cellsize: Size of the cell in degrees
            num_positions: Number of positions to test
            settlement_type: Type of settlement
            
        Returns:
            True if positions are consistent across multiple calls
        """
        # Get positions twice
        positions1 = self.get_deterministic_positions(lat, lon, cellsize, num_positions, settlement_type)
        positions2 = self.get_deterministic_positions(lat, lon, cellsize, num_positions, settlement_type)
        
        if len(positions1) != len(positions2):
            return False
            
        # Check that all positions are identical
        for p1, p2 in zip(positions1, positions2):
            if (abs(p1.coordinates.latitude - p2.coordinates.latitude) > 1e-10 or
                abs(p1.coordinates.longitude - p2.coordinates.longitude) > 1e-10 or
                p1.cell_id != p2.cell_id or
                p1.position_index != p2.position_index):
                return False
                
        return True