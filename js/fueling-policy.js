// Rule Engine-owned carb ceiling; shared with the live fueling card.
(function(root){
  'use strict';
  function limit(requested,{practicedCarbsPerHour,explicitOverride=false}={}) {
    const practiced=Number(practicedCarbsPerHour);
    const confirmed=Number.isFinite(practiced)&&practiced>=10&&practiced<=120;
    const gutCap=confirmed?practiced:60;
    const ceiling=explicitOverride?gutCap:Math.min(gutCap,90);
    const amount=Number(requested);
    if(!Number.isFinite(amount)||amount<=0)throw Error('Choose a positive carbohydrate target.');
    return {carbsPerHour:Math.min(amount,ceiling),gutCap,practiceLevelConfirmed:confirmed,capped:amount>ceiling};
  }
  const api={limit};if(root)root.FuelingPolicy=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:null);
