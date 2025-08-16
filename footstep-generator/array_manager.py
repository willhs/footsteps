#!/usr/bin/env python3
"""
Array management utilities for efficient dot storage during HYDE data processing.
Handles pre-allocation, growth, and conversion of settlement dots.
"""

import numpy as np
from typing import List, Dict, Any


class DotArrayManager:
    """
    Manages efficient storage and growth of settlement dots during processing.
    
    Uses pre-allocated NumPy arrays with automatic resizing to minimize
    memory allocation overhead compared to growing Python lists.
    """
    
    def __init__(self, estimated_capacity: int, growth_increment: int = 1000):
        """
        Initialize dot array manager.
        
        Args:
            estimated_capacity: Initial array size estimate
            growth_increment: How much to grow arrays when they fill up
        """
        self.capacity = max(estimated_capacity, 100)  # Minimum reasonable size
        self.growth_increment = growth_increment
        self.count = 0
        
        # Pre-allocate arrays
        self.lons = np.zeros(self.capacity)
        self.lats = np.zeros(self.capacity)
        self.populations = np.zeros(self.capacity)
        
    def add_dot(self, lon: float, lat: float, population: float) -> None:
        """
        Add a single dot to the arrays.
        
        Args:
            lon: Longitude
            lat: Latitude
            population: Population value
        """
        # Resize if needed
        if self.count >= self.capacity:
            self._resize_arrays()
        
        # Store values
        self.lons[self.count] = lon
        self.lats[self.count] = lat
        self.populations[self.count] = population
        self.count += 1
    
    def add_dots_batch(self, dots_data: List[tuple]) -> None:
        """
        Add multiple dots efficiently.
        
        Args:
            dots_data: List of (lon, lat, population) tuples
        """
        if not dots_data:
            return
            
        needed_capacity = self.count + len(dots_data)
        
        # Resize if needed
        while self.capacity < needed_capacity:
            self._resize_arrays()
        
        # Store all values at once
        for i, (lon, lat, pop) in enumerate(dots_data):
            idx = self.count + i
            self.lons[idx] = lon
            self.lats[idx] = lat
            self.populations[idx] = pop
            
        self.count += len(dots_data)
    
    def to_dict_list(self, year: int, settlement_type: str = "settlement") -> List[Dict[str, Any]]:
        """
        Convert stored arrays to list of dictionaries.
        
        Args:
            year: Year value for all dots
            settlement_type: Type value for all dots
            
        Returns:
            List of settlement dictionaries
        """
        if self.count == 0:
            return []
        
        # Trim arrays to actual size
        actual_lons = self.lons[:self.count]
        actual_lats = self.lats[:self.count]
        actual_pops = self.populations[:self.count]
        
        # Convert to list of dicts
        return [
            {
                "lon": float(actual_lons[i]),
                "lat": float(actual_lats[i]),
                "population": float(actual_pops[i]),
                "year": int(year),
                "type": settlement_type,
            }
            for i in range(self.count)
        ]
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about array usage.
        
        Returns:
            Dictionary with usage statistics
        """
        return {
            "count": self.count,
            "capacity": self.capacity,
            "utilization": self.count / self.capacity if self.capacity > 0 else 0.0,
            "total_population": float(np.sum(self.populations[:self.count])) if self.count > 0 else 0.0,
            "memory_mb": (self.capacity * 3 * 8) / (1024 * 1024),  # 3 arrays * 8 bytes per float64
        }
    
    def _resize_arrays(self) -> None:
        """Resize all arrays by the growth increment."""
        new_capacity = self.capacity + self.growth_increment
        
        # Resize arrays
        self.lons = np.resize(self.lons, new_capacity)
        self.lats = np.resize(self.lats, new_capacity)
        self.populations = np.resize(self.populations, new_capacity)
        
        self.capacity = new_capacity


def estimate_dot_capacity(cell_populations: np.ndarray, people_per_dot: int, buffer_factor: float = 1.2) -> int:
    """
    Estimate the number of dots needed for array pre-allocation.
    
    Args:
        cell_populations: Array of population values per cell
        people_per_dot: Number of people each dot represents
        buffer_factor: Safety buffer (e.g., 1.2 = 20% extra capacity)
        
    Returns:
        Estimated number of dots needed
    """
    if len(cell_populations) == 0:
        return 100  # Minimum reasonable capacity
    
    total_population = np.sum(cell_populations)
    base_estimate = int(total_population / people_per_dot)
    
    # Add buffer for density-aware dot creation variability
    buffered_estimate = int(base_estimate * buffer_factor)
    
    # Ensure minimum reasonable capacity
    return max(buffered_estimate, 100)