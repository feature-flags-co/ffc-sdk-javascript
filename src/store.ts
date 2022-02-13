import { featureFlagEvaluatedTopic } from "./constants";
import { eventHub } from "./events";
import { logger } from "./logger";
import { FeatureFlagUpdateOperation, IDataStore, IFeatureFlag, StreamResponseEventType } from "./types";

const DataStoreStorageKey = 'ffcdatastore';

export class Store {

  private _isDevMode: boolean = false;
  private _userId: string | null = null;

  private _store: IDataStore = {
    featureFlags: {} as { [key: string]: IFeatureFlag }
  }

  constructor() {
    eventHub.subscribe(`devmode_ff_${FeatureFlagUpdateOperation.update}`, (data) => {
      const updatedFfs = Object.keys(data).map(key => {
        const changes = data[key];
        const ff = this._store.featureFlags[key];
        const updatedFf = Object.assign({}, ff, {variation: changes['newValue'], version: Date.now()});
        return updatedFf;
      }).reduce((res, curr) => {
        res.featureFlags[curr.id] = Object.assign({}, curr, { timestamp: Date.now()});
        return res;
      }, {featureFlags: {}});

      this.updateBulk(updatedFfs);
    });

    eventHub.subscribe(`devmode_ff_${FeatureFlagUpdateOperation.createDevData}`, () => {
      localStorage.removeItem(`${DataStoreStorageKey}_dev_${this._userId}`);
      this._loadFromStorage();
      eventHub.emit(`devmode_ff_${FeatureFlagUpdateOperation.devDataCreated}`, this._store.featureFlags);
    });
  }

  set userId(id: string) {
    this._userId = id;
    this._loadFromStorage();
  }

  set isDevMode(devMode: boolean) {
    this._isDevMode = devMode;
    this._loadFromStorage();
  }

  getVariation(key: string): string {
    const featureFlag = this._store.featureFlags[key];
    if (!!featureFlag) {
      eventHub.emit(featureFlagEvaluatedTopic, {
        id: featureFlag.id,
        timestamp: Date.now(),
        sendToExperiment: featureFlag.sendToExperiment,
        variation: featureFlag.variationOptions.find(o => o.value === featureFlag.variation)
      });
    }

    return featureFlag?.variation;
  }

  setFullData(data: IDataStore) {
    if (this._isDevMode) {
      // do nothing
    } else {
      this._store = Object.assign({}, data);
      this._dumpToStorage();
    }
  }

  getFeatureFlags(): {[key: string]: IFeatureFlag}{
    return this._store.featureFlags;
  }

  update(ff: IFeatureFlag) {
    if (ff) {
      this.updateBulk({
        featureFlags: {
          [ff.id]: Object.assign({}, ff)
        }
      })
    }
  }

  updateBulkFromRemote(data: IDataStore){
    if (!this._isDevMode) {
      this.updateBulk(data);
      return;
    }

    const storageKey = `${DataStoreStorageKey}_${this._userId}`;
    let dataStoreStr = localStorage.getItem(storageKey);
    let store: IDataStore;
    
    try {
      if (dataStoreStr && dataStoreStr.trim().length > 0) {
        store = JSON.parse(dataStoreStr);
      } else {
        store = {
          featureFlags: {} as { [key: string]: IFeatureFlag }
        };
      }

      const { featureFlags } = data;    

      Object.keys(featureFlags).forEach(id => {
        const remoteFf = featureFlags[id];
        const localFf = store.featureFlags[id];

        if (!localFf || remoteFf.timestamp > localFf.timestamp) {
          store.featureFlags[remoteFf.id] = Object.assign({}, remoteFf);
        }
      });
      
      this._dumpToStorage(store);
    } catch(err) {
      logger.logDebug('error while loading local data store: ' + err);
    }
  }

  updateBulk(data: IDataStore) {
    const { featureFlags } = data;
    const updatedFeatureFlags: any[] = [];

    Object.keys(featureFlags).forEach(id => {
      const remoteFf = featureFlags[id];
      const localFf = this._store.featureFlags[id];

      if (!localFf || remoteFf.timestamp > localFf.timestamp) {
        this._store.featureFlags[remoteFf.id] = Object.assign({}, remoteFf);
          updatedFeatureFlags.push({
            id: remoteFf.id,
            operation: FeatureFlagUpdateOperation.update,
            data: {
              id: remoteFf.id,
              oldValue: localFf?.variation,
              newValue: remoteFf.variation
            }
          });
      }
    });

    updatedFeatureFlags.forEach(({id, operation, data}) => {
      eventHub.emit(`ff_${operation}:${data.id}`, data);
    });

    eventHub.emit(`ff_${FeatureFlagUpdateOperation.update}`, updatedFeatureFlags.reduce((res, curr) => {
      const { id, oldValue, newValue } = curr.data;
      res[id] = res[id] || { id, oldValue, newValue };

      return res;
    }, {}));

    this._dumpToStorage();
  }

  private _dumpToStorage(store?: IDataStore): void {
    if (store) {
      const storageKey = `${DataStoreStorageKey}_${this._userId}`;
      localStorage.setItem(storageKey, JSON.stringify(store));
      return;
    }
    const storageKey = this._isDevMode ? `${DataStoreStorageKey}_dev_${this._userId}` : `${DataStoreStorageKey}_${this._userId}`;
    localStorage.setItem(storageKey, JSON.stringify(this._store));
  }

  private _loadFromStorage(): void {
    try {
      const storageKey = this._isDevMode ? `${DataStoreStorageKey}_dev_${this._userId}` : `${DataStoreStorageKey}_${this._userId}`;
      let dataStoreStr = localStorage.getItem(storageKey);

      let shouldDumpToStorage = false;
      if (this._isDevMode && dataStoreStr === null) {
        shouldDumpToStorage = true;
        dataStoreStr = localStorage.getItem(`${DataStoreStorageKey}_${this._userId}`);
      }

      if (dataStoreStr && dataStoreStr.trim().length > 0) {
        // compare _store and dataStoreStr data and send notification if different
        const storageData: IDataStore = JSON.parse(dataStoreStr);

        if (Object.keys(this._store.featureFlags).length > 0) {
          const updatedFeatureFlags = Object.keys(storageData.featureFlags).filter(key => {
            const storageFf = storageData.featureFlags[key];
            const ff = this._store.featureFlags[key];
            return !ff || storageFf.variation !== ff.variation;
          }).map(key => {
            const storageFf = storageData.featureFlags[key];
            const ff = this._store.featureFlags[key];
  
            return {
              id: key,
              operation: FeatureFlagUpdateOperation.update,
              data: {
                  id: key,
                  oldValue: ff?.variation,
                  newValue: storageFf.variation
              }
            }
          });
  
          this._store = storageData;
  
          updatedFeatureFlags.forEach(({id, operation, data}) => {
            eventHub.emit(`ff_${operation}:${data.id}`, data);
          });
  
          eventHub.emit(`ff_${FeatureFlagUpdateOperation.update}`, updatedFeatureFlags.reduce((res, curr) => {
            const { id, oldValue, newValue } = curr.data;
            res[id] = res[id] || { id, oldValue, newValue };
  
            return res;
          }, {}));
        } else {
          this._store = storageData;
        }
      } else {
        this._store = {
          featureFlags: {} as { [key: string]: IFeatureFlag }
        };
      }

      if (shouldDumpToStorage) {
        this._dumpToStorage();
      }

    } catch(err) {
      logger.logDebug('error while loading local data store: ' + err);
    }
  }
}