import Ember from 'ember';
import DS from 'ember-data';

const {
    computed,
    get,
    set,
    String: { dasherize },
    isArray,
    isEmpty,
    keys: emberKeys,
    on,
    run: { scheduleOnce }
} = Ember;

const keys = Object.keys || emberKeys;

export function initialize(applicationInstance) {
    let fastboot = applicationInstance.lookup('service:fastboot');
    let store = applicationInstance.lookup('service:store');

    Ember.Route.reopen({
        shoeboxRouteEnabled: true,
        fastboot,

        /**
            This property becomes the shoebox store name when serialized.
            @property routeNameDasherized
            @type String
            @default Dasherized current route name
            @public
        */
        routeNameDasherized: computed('routeName', function() {
            let routeName = get(this, 'routeName').replace(/\.+/g," ");
            return dasherize(routeName);
        }),

        /**
            Retrieves the shoebox store for a given name and returns null if sheobox or shoebox store does not exist.
            @method getShoeboxStore
            @param {String} name The name of the shoebox store
            @return {Object} The shoebox store
            @public
        */
        getShoeboxStore (name) {
            let shoebox = get(fastboot, 'shoebox');
            return shoebox ? shoebox.retrieve(name) : null;
        },

        /**
            Decides whether or not the data for the route should be loaded from the shoebox. It breaks down as follows:
            1) If we are in fastboot, we should NOT return shoebox data.
            2) If we do not have a shoebox store for this route, we should NOT return shoebox data
            3) Otherwise return the shoebox data
            @property shouldLoadFromShoebox
            @type Boolean
            @public
        */
        shouldLoadFromShoebox: computed('fastboot.isFastBoot', 'fastboot.shoebox', function() {
            if (get(this, 'fastboot.isFastBoot')) {
                    return false;
            } else {
                let routeName = get(this, 'routeNameDasherized');
                let shoeboxStore = this.getShoeboxStore(routeName);
                if (!shoeboxStore) {
                    return false;
                }
                return true;
            }
        }),

        /**
            Given a ED model, this method serializes it by looking up the applications serializers
            for the specific model (which fall back to the global application serializer if neccessary)
            Then it uses the store to normalize the data into the JSON API standard so it can be easily
            pushed back into the store when the web application boots up.

            @method serializeEDModel
            @param {DS.Model|DS.RecordArray} model The model data of the route
            @return {Object} The normalized model data
            @public
        */
        serializeEDModel (model) {
            if(isArray(model)) {
                const modelName = model.get('firstObject.constructor.modelName');
                const serializer = store.serializerFor(modelName);
                const json = model.reduce((a,b) => a.concat(b), [])
                    .map(record => record._createSnapshot())
                    .map(snapshot => {
                      let json = serializer.serialize(snapshot, { includeId: true });
                      let normalizedJson = store.normalize(modelName, json);
                      normalizedJson.__emberDataModel = true;
                      return normalizedJson;
                  });
                return json;
            } else {
                const modelName = model.constructor.modelName;
                const serializer = store.serializerFor(modelName);
                const json = serializer.serialize(model._createSnapshot(), { includeId: true });
                let normalizedJson = store.normalize(modelName, json);
                normalizedJson.__emberDataModel = true;
                return normalizedJson;
            }
        },

        /**
            Parses the shoebox store information for the route and returns the records that were pushed into the ember data store
            @method getShoeboxModelForRoute
            @return {DS.Model|DS.Array|Object} The record(s) that were pushed into the DS store
            @public
        */
        getShoeboxModelForRoute() {
            let shoebox = get(fastboot, 'shoebox');
            let routeName = get(this, 'routeNameDasherized');
            let records = null;
            let shoeboxStore = this.getShoeboxStore(routeName);

            if (!shoeboxStore) {
                return;
            }

            records = this.deserializeShoeboxModel(shoeboxStore);
            this.clearShoeboxRoute(shoebox, routeName);
            return records;
        },

        /**
            Recusively deserializes the data for a particular shoebox
            @method deserializeShoeboxModel
            @param {Object} model The object given from the shoebox
            @return {DS.Model|DS.Array|Object} The actual route model
            @public
        */
        deserializeShoeboxModel(model) {
            if (!isEmpty(model)) {
                if (this.isEDModel(model)) {
                    delete model.__emberDataModel;
                    return store.push(model);
                }

                if (typeof model === 'object') {
                    keys(model).forEach(key => {
                        let attribute = model[key];
                        let attributeModel = this.deserializeShoeboxModel(attribute);
                        model[key] = attributeModel;
                        return attributeModel;
                    });
                }
            }

            return model;
        },

        /**
            Removes specific shoebox from DOM
            @method clearShoeboxRoute
            @param {Object} shoebox The shoebox object
            @param {String} routeName The name of the route to clear the shoebox for
            @public
        */
        clearShoeboxRoute (shoebox, routeName) {
            set(shoebox, routeName, null);
            let shoeboxStoreNode = document.querySelector(`#shoebox-${routeName}`);
            shoeboxStoreNode.parentElement.removeChild(shoeboxStoreNode);
        },

        /**
            The method thats get called inplace of the user defined model
            @method shoeboxModel
            @return {DS.Model|Array|Object} The record(s) that were in the shoebox store
            @public
        */
        shoeboxModel() {
            return this.getShoeboxModelForRoute();
        },

        /**
            Checks to see if we should load the shoebox data.

            If we should it saves the routes user defined model method as originalModel.
            It then sets the shoebox model as the routes current model.

            If we should not load from shoebox & an orignalModel exists we want to set originalModel back to the model so the application will function correctly on next load of route.

            @method selectModel
            @private
        */
        _selectModel () {
            if (get(this, 'shouldLoadFromShoebox')) {
                set(this, 'originalModel', get(this, 'model'));
                set(this, 'model', this.shoeboxModel);
            }
        },

        /**
            Checks to see if we are in fastboot, and if the route has model.
            If thats the case we want to serialize the model and add it to the shoebox

            @method serializeRouteModel
            @private
        */

        _serializeRouteModel (){
            let routeName = get(this, 'routeNameDasherized');
            let shoebox = get(fastboot, 'shoebox');
            let model = this.currentModel;
            //If this is in fastboot, put this routes model into a specific shoebox store so we can transfer exactly what was in the model to the correct route
            if (get(fastboot, 'isFastBoot') && model && get(this, 'shoeboxRouteEnabled')) {
                let data = this.serializeShoeboxModel(model);
                shoebox.put(routeName, data);
            }

            if (get(this, 'originalModel')) {
                set(this, 'model', get(this, 'originalModel'));
            }

        },

        /**
            Checks if an object is an ED (Ember Data) Model. First checks the instanceof to see if the item is
            an instance of a DS object. If the item is not a instance of a DS object, and the item is an object
            we check to see if it has __emberDataModel as true. If thats the case, this is a ED model which has
            just been serialized already.

            @method isEDModel
            @param {Object} model
            @return {Boolean}
            @public
        */
        isEDModel(item) {
            let isEDInstance = (item instanceof DS.RecordArray || item instanceof DS.Model);
            if (!isEDInstance && typeof item === 'object'){
                isEDInstance = item.__emberDataModel || false;
            }
            return isEDInstance;
        },

        /**
            Recursively serializes the shoebox data for a particular object (Ember Data or not)

            @method serializeShoeboxModel
            @param {Object} model
            @return {Object}
            @public
        */
        serializeShoeboxModel (model) {
            if (!isEmpty(model)) {
                if (this.isEDModel(model)) {
                    let json = this.serializeEDModel(model);
                    return json;
                }
                if (typeof model === 'object') {
                    keys(model).forEach(key => {
                        let attribute = model[key];
                        let json = this.serializeShoeboxModel(attribute);
                        model[key] = json;
                        return json;
                    });
                }
            } else {
                return null;
            }
            return model;
        },
        _activate: on('activate', function() {
            scheduleOnce('routerTransitions', this, this._serializeRouteModel);
        }),
        _onInit: on('init', function() {
            scheduleOnce('sync', this, this._selectModel);
        })
    });
}

export default {
  name: 'fastboot-data-route',
  initialize
};
