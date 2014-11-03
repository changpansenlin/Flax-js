/**
 * Created by long on 14-1-31.
 */

var flax = flax || {};

F2C_ALIAS = {mc:"flax.MovieClip",
             btn:"flax.SimpleButton",
             button:"flax.Button",
             progress:"flax.ProgressBar",
             scrollPane:"flax.ScrollPane",
             scrollPane1:"flax.ScrollPane1",
             gun:"flax.Gunner",
             gun1:"flax.MCGunner"
            };

flax.AssetsManager = cc.Class.extend({
    framesCache:null,
    displaysCache:null,
    displayDefineCache:null,
    mcsCache:null,
    subAnimsCache:null,
    fontsCache:null,

   init:function()
   {
       this.framesCache = {};
       this.displaysCache = {};
       this.displayDefineCache = {};
       this.mcsCache = {};
       this.subAnimsCache = {};
       this.fontsCache = {};
   },
    /**
     * Create a display from a assetsFile with assetID
     * @param {String} assetsFile the assetsFile
     * @param {String} assetID the asset id in the assetsFile
     * @param {String} clsName the class name to create the display, if null, it'll be automatically set according by the assets file
     * @param {Boolean} fromPool if the display should fetch from the pool
     * @param {Node} parent its parent container
     * @param {Object} params params could be set to the target with attr function
     * */
   createDisplay:function(assetsFile, assetID, clsName, fromPool, parent, params)
   {
       if(assetsFile == null || assetID == null){
           throw  "Pleas give me assetsFile and assetID!";
       }
       this.addAssets(assetsFile);

       var clsPreDefined = false;
       if(clsName) clsPreDefined = true;
       else clsName = assetID;

       var subAnims = this.getSubAnims(assetsFile, assetID);
       if(subAnims.length) {
           assetID = assetID + "$" + subAnims[0];
       }

       var mcCls = flax.nameToObject(clsName);
       if(mcCls == null && clsPreDefined){
           throw "The class: "+clsName+" doesn't exist!"
       }
        if(mcCls == null && !clsPreDefined) {
            var define = this.getDisplayDefine(assetsFile, assetID);
            var isMC = false;
            if(define == null) {
                define = this.getMc(assetsFile, assetID);
                isMC = true;
            }
            if(define){
                clsName = define.type;
                mcCls = flax.nameToObject(clsName);
                if(mcCls == null){
                    clsName = F2C_ALIAS[clsName];
                    mcCls = flax.nameToObject(clsName);
                }
                if(mcCls == null)
                {
                    mcCls = isMC ? flax.MovieClip : flax.Animator;
                    clsName = isMC ? "flax.MovieClip" : "flax.Animator";
                }
            }else{
                throw  "There is no display with assetID: "+assetID+" in assets file: "+assetsFile;
            }
        }
//       this._checkCreateFunc(mcCls, clsName);
       var mc = null;
       if(fromPool === true) {
           mc = flax.ObjectPool.get(assetsFile,clsName,assetID).fetch(assetID, parent, params);
       }else{
           if(mcCls.create) mc = mcCls.create(assetsFile, assetID);
           else mc = new mcCls(assetsFile, assetID);
           if(params) mc.attr(params);
           if(parent) parent.addChild(mc);
           mc.clsName = clsName;
       }
       return mc;
   },
    /**
     * Clone a new display from the target, if fromPool = true, it'll be fetched from the pool
     * It only supports flax.FlaxSprite or its sub classes
     * */
    cloneDisplay:function(target, fromPool, autoAdd)
    {
        if(!(target instanceof flax.FlaxSprite)) {
            throw "cloneDisplay only support flax.FlaxSprite type!"
        }
        var obj = this.createDisplay(target.assetsFile, target.assetID, target.clsName, fromPool, autoAdd ? target.parent : null);
        if(autoAdd) obj.setPosition(target.getPosition());
        obj.setScale(target.getScale());
        obj.setRotation(target.rotation);
        obj.zIndex = target.zIndex;
        return obj;
    },
    _checkCreateFunc:function(target, clsName)
    {
        if(target == null) {
            throw "The class: "+clsName+" is not found!";
        }else if(target.create == null){
            throw "Please implement  a create(assetsFile, assetID) method for the target class: "+clsName;
        }
    },
    addAssets:function(assetsFile)
    {
        if(typeof this.framesCache[assetsFile] !== "undefined") return false;

        var assetsFile1 = assetsFile;
        var ext = cc.path.extname(assetsFile)
        if(ext != ".plist" && ext != ".json") assetsFile1 = cc.path.changeBasename(assetsFile, ".json");
        var dict = cc.loader.getRes(assetsFile1);
        if(dict == null){
            throw "Make sure you have pre-loaded the resource: "+assetsFile;
        }
        cc.spriteFrameCache.addSpriteFrames(assetsFile1);

        //parse the frames
        var frames = [];
        var frameDict = dict.frames;
        for(var key in frameDict)
        {
            frames.push(key);
        }
        //sort ascending
        frames.sort();

        this.framesCache[assetsFile] = frames;

        //parse the displays defined in the assets
        if(dict.hasOwnProperty("displays"))
        {
            this._parseDisplays(assetsFile, dict.displays);
        }
        //parse the movieClipgs
        if(dict.hasOwnProperty("mcs"))
        {
            this._parseMovieClips(assetsFile, dict.mcs);
        }
        //parse the fonts
        if(dict.hasOwnProperty("fonts"))
        {
            this._parseFonts(assetsFile, dict.fonts);
        }
        return true;
    },
    _parseDisplays:function(assetsFile, displays){
        var displayNames = [];
        var dDefine = null;
        for(var dName in displays)
        {
            displayNames.push(dName);
            dDefine = displays[dName];
            if(dDefine.anchors) dDefine.anchors = this._parseFrames(dDefine.anchors);
            if(dDefine.colliders) dDefine.colliders = this._parseFrames(dDefine.colliders);
            this.displayDefineCache[assetsFile + dName] = dDefine;
            this._parseSubAnims(assetsFile, dName);
        }
        this.displaysCache[assetsFile] = displayNames;
    },
    _parseMovieClips:function(assetsFile, mcs){
        for(var sName in mcs)
        {
            var mcDefine = mcs[sName];
            if(mcDefine.anchors) mcDefine.anchors = this._parseFrames(mcDefine.anchors);
            if(mcDefine.colliders) mcDefine.colliders = this._parseFrames(mcDefine.colliders);
            var childDefine;
            var childrenDefine = mcDefine.children;
            for(var childName in childrenDefine)
            {
                childDefine = childrenDefine[childName];
                childDefine.frames = this._strToArray(childDefine.frames);
            }
            this.mcsCache[assetsFile + sName] = mcDefine;
            //see if there is a '$' sign which present sub animation of the mc
            this._parseSubAnims(assetsFile, sName);
        }
    },
    _parseFonts:function(assetsFile, fonts){
        for(var fName in fonts)
        {
            this.fontsCache[assetsFile + fName] = fonts[fName];
        }
    },
    _parseSubAnims:function(assetsFile, assetID)
    {
        var aarr = assetID.split("$");
        var rname = aarr[0];
        var aname = aarr[1];
        if(rname && aname && rname != '' && aname != ''){
            var akey = assetsFile + rname;
            var anims = this.subAnimsCache[akey];
            if(anims == null) {
                anims = [];
                this.subAnimsCache[akey] = anims;
            }
            anims.push(aname);
        }
    },
    _parseFrames:function(data){
        var dict = {};
        for(var name in data)
        {
            dict[name] = this._strToArray(data[name]);
        }
        return dict;
    },
    _strToArray:function(str){
        var frames = str.split("|");
        var i = -1;
        var arr = [];
        while(++i < frames.length)
        {
            var frame = frames[i];
            if(frame === "null") arr.push(null);
            //"" means the params is the same as prev frame
            else if(frame === "") arr.push(arr[i - 1]);
            else arr.push(frame);
        }
        return arr;
    },
    getFrameNames:function(assetsFile, startFrame, endFrame)
    {
        if(typeof this.framesCache[assetsFile] === "undefined") {
            this.addAssets(assetsFile);
        }
        var frames = this.framesCache[assetsFile];
        if(frames == null) return [];
        if(startFrame == -1) startFrame = 0;
        if(endFrame == -1) endFrame = frames.length - 1;
        return frames.slice(parseInt(startFrame), parseInt(endFrame) + 1);
    },
    getDisplayDefine:function(assetsFile, assetID)
    {
        var key = assetsFile + assetID;
        if(!(key in this.displayDefineCache))
        {
            this.addAssets(assetsFile);
        }
        return this.displayDefineCache[key];
    },
    getDisplayNames:function(assetsFile)
    {
        if(typeof this.displaysCache[assetsFile] === "undefined")
        {
            this.addAssets(assetsFile);
        }
        return this.displaysCache[assetsFile] || [];
    },
    getRandomDisplayName:function(assetsFile)
    {
        var names = this.getDisplayNames(assetsFile);
        var i = Math.floor(Math.random()*names.length);
        return names[i];
    },
    getMc:function(assetsFile, assetID)
    {
        var key = assetsFile + assetID;
        if(!(key in this.mcsCache)) {
            this.addAssets(assetsFile);
        }
        return this.mcsCache[key];
    },
    getSubAnims:function(assetsFile, theName)
    {
        var akey = assetsFile + theName;
        return this.subAnimsCache[akey] || [];
    },
    getFont:function(assetsFile, fontName)
    {
        var key = assetsFile + fontName;
        if(typeof this.fontsCache[key] === "undefined"){
            this.addAssets(assetsFile);
        }
        return this.fontsCache[key];
    }
});



flax.AssetsManager.create = function()
{
    var am = new flax.AssetsManager();
    am.init();
    return am;
};

flax._flaxLoader = {
    load : function(realUrl, url, res, cb){
        cc.loader.loadBinary(realUrl, function(err, data){
            var zlib = new Zlib.RawInflate(data);
            var txts = zlib.decompress();

            //from char code to string
            var txt = "";
            var len = txts.length;
            for(var i = 0; i < len; i++){
                txt += String.fromCharCode(txts[i]);
            }
            var keyWord = "data:image/gif;base64,";
            data = txt.split(keyWord);
            var jsonUrl = cc.path.changeBasename(realUrl, ".json");
            var pngUrl = cc.path.changeBasename(realUrl, ".png");
            //hadle json
            cc.loader.cache[jsonUrl] = JSON.parse(data[0]);
            flax.assetsManager.addAssets(realUrl);
            //handle image
            var image = new Image();
            image.src = keyWord+data[1];
            cc.loader.cache[pngUrl] = image;
            cc.textureCache.handleLoadedTexture(pngUrl);

            err ? cb(err) : cb(null, "Not reachable!");
            cc.loader.release(realUrl);
        });
    }
};
//the uncompression takes too much time to handle, so you'd beter use it in mobile.
// and in JSB it is not support, not use tow
if(!cc.sys.isNative){
    cc.loader.register(["flax"], flax._flaxLoader);
}