/**
 * W-1: Logistics-specific form state hook
 *
 * Extracted from use-im-data-form.ts for logistics center fields.
 */
import { useState } from 'react';

export function useLogisticsFormState() {
  const [ceilingHeight, setCeilingHeight] = useState<string>('');
  const [dockCount, setDockCount] = useState<string>('');
  const [dockLevelerCount, setDockLevelerCount] = useState<string>('');
  const [maxVehicleTon, setMaxVehicleTon] = useState<string>('');
  const [floorLoadTon, setFloorLoadTon] = useState<string>('');
  const [coldStorageArea, setColdStorageArea] = useState<string>('');
  const [coldStorageType, setColdStorageType] = useState<string>('none');
  const [loadingArea, setLoadingArea] = useState<string>('');
  const [vehicleAccessType, setVehicleAccessType] = useState<string>('dock');
  const [fireRating, setFireRating] = useState<string>('');
  const [sprinkler, setSprinkler] = useState(false);
  const [columnSpan, setColumnSpan] = useState<string>('');
  const [powerCapacity, setPowerCapacity] = useState<string>('');
  const [hasOfficeSpace, setHasOfficeSpace] = useState(false);
  const [officeArea, setOfficeArea] = useState<string>('');
  const [distanceToIc, setDistanceToIc] = useState<string>('');
  const [icName, setIcName] = useState<string>('');

  return {
    ceilingHeight, setCeilingHeight,
    dockCount, setDockCount,
    dockLevelerCount, setDockLevelerCount,
    maxVehicleTon, setMaxVehicleTon,
    floorLoadTon, setFloorLoadTon,
    coldStorageArea, setColdStorageArea,
    coldStorageType, setColdStorageType,
    loadingArea, setLoadingArea,
    vehicleAccessType, setVehicleAccessType,
    fireRating, setFireRating,
    sprinkler, setSprinkler,
    columnSpan, setColumnSpan,
    powerCapacity, setPowerCapacity,
    hasOfficeSpace, setHasOfficeSpace,
    officeArea, setOfficeArea,
    distanceToIc, setDistanceToIc,
    icName, setIcName,
  };
}
