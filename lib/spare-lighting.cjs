// Author: Cory McCabe
'use strict';
const {batteryFrame}=require('./battery.cjs');

class SpareLighting {
  constructor(channel,{darkKeysChannel,pending=false,onOwnershipChange=()=>{}}={}){
    if(!Number.isInteger(channel)||channel<6||channel>19)throw new Error('A spare lighting channel is required.');
    if(!Number.isInteger(darkKeysChannel)||darkKeysChannel<6||darkKeysChannel>19||darkKeysChannel===channel)throw new Error('A separate spare channel is required to keep the action keys dark.');
    this.channel=channel;
    this.darkKeysChannel=darkKeysChannel;
    this.owned=pending;
    this.signature='';
    this.onOwnershipChange=onOwnershipChange;
  }
  async release(rpc){
    if(!this.owned)return false;
    await this.ack(rpc,'v.oai.thstatus',[{id:this.channel,sk:0,sa:0},{id:this.darkKeysChannel,sk:0,sa:0}]);
    // Empty optional-field update reapplies the device's cached native RGB
    // configuration. Do not replace it with saved Input defaults or a guess.
    await this.ack(rpc,'v.oai.rgbcfg',{});
    this.owned=false;this.signature='';this.onOwnershipChange(false);
    return true;
  }
  async ack(rpc,method,params){
    if((await rpc(method,params))?.ok!==1)throw new Error('Layer-lighting acknowledgment missing.');
  }
  async sync(rpc,position,status,preferences){
    if (preferences && !['battery','white','off','inherit'].includes(preferences.mode)) throw new Error('Invalid layer-lighting mode.');
    const active=status.profile_index===position.profile&&status.layer_index===position.layer;
    if(!active){const restored=await this.release(rpc);return{override:false,opaqueKeysOff:false,action:restored?'native-cache-restored':'unchanged',color:null};}
    const brightness=preferences.brightness;
    if(!Number.isFinite(brightness)||brightness<0||brightness>1)throw new Error('Invalid matching-light brightness.');
    const color=preferences.mode==='battery'?batteryFrame(status.battery).color:0xffffff;
    const effectiveBrightness=preferences.mode==='off'?0:brightness;
    const inherit=preferences.mode==='inherit';
    const signature=JSON.stringify([preferences.mode,color,effectiveBrightness]);
    if(!this.owned||signature!==this.signature){
      if(!this.owned){this.onOwnershipChange(true);this.owned=true;}
      await this.ack(rpc,'v.oai.thstatus',[
        inherit?{id:this.channel,sk:0,sa:0}:{id:this.channel,c:color,b:effectiveBrightness,e:effectiveBrightness?1:0,s:0,sk:0,sa:1},
        {id:this.darkKeysChannel,c:0,b:0,e:0,s:0,sk:1,sa:0}
      ]);
      if(inherit)await this.ack(rpc,'v.oai.rgbcfg',{});
      this.signature=signature;
    }
    return{override:!inherit,opaqueKeysOff:true,action:inherit?'battery-dark-keys':'battery-underglow-and-dark-keys',color:inherit?null:color};
  }
}
module.exports={SpareLighting};
