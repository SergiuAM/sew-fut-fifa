import {
  idPackDuplicatesAction,
  idPackNonPlayersAction,
  idPackOpenCredits,
  idPackPlayersAction,
  idPacksCount,
} from "../app.constants";
import { formatDataSource, hideLoader, showLoader, wait } from "./commonUtil";
import { sendPinEvents, sendUINotification } from "./notificationUtil";
import { t } from "../services/translate";
import { updateUserCredits } from "../services/user";
import { getDataSource, getValue } from "../services/repository";
import { listCards } from "./reListUtil";
import { fetchPrices } from "../services/datasource";


export const validateFormAndOpenPack = async (pack) => {
  const popUpValues = getPopUpValues();
  await buyRequiredNoOfPacks(pack, popUpValues);
};

const setUpType = () => {
  const defaultOptions = [
    {
      value: "moveClub",
      label: t("moveToClub"),
    },
    {
      value: "moveTransfers",
      label: t("moveToTransferList"),
    },
    {
      value: "quickSell",
      label: t("quickSell"),
    },
    {
      value: "listExternal",
      label: formatDataSource(t("listFutBin"), getDataSource()),
    },
  ];
  return [
    { id: idPackPlayersAction, label: t("players"), actions: defaultOptions },
    {
      id: idPackNonPlayersAction,
      label: t("nonPlayers"),
      actions: defaultOptions.slice(0, 3),
    },
    {
      id: idPackDuplicatesAction,
      label: t("duplicates"),
      actions: defaultOptions.slice(1),
    },
  ];
};

export const purchasePopUpMessage = () => {
  const handlerForEachType = setUpType();
  return `
${handlerForEachType
  .map(({ id, label, actions }) => {
    return `
${label}
<select class="sbc-players-list" id="${id}"
    style="overflow-y : scroll">
    ${actions.map(
      ({ value, label }) => `<option value='${value}'>${label}</option>`
    )}
 </select> 
 <br />
 <br />
`;
  })
  .join("")}
 <br />
 <br />
 ${t("noOfPacks")}
 <input placeholder="3" id=${idPacksCount} type="number" class="ut-text-input-control fut-bin-buy" />
 <br /> <br />
 ${GameCurrency.COINS}/${GameCurrency.POINTS}
 <select class="sbc-players-list" id="${idPackOpenCredits}"
    style="overflow-y : scroll">
    <option value=${GameCurrency.COINS}>${services.Localization.localize(
    "currency.coins"
  )}</option>
    <option value=${GameCurrency.POINTS}>${services.Localization.localize(
    "currency.points"
  )}</option>
 </select>
 <br /> <br />
 `;
};

const getPopUpValues = () => {
  const noOfPacks = parseInt($(`#${idPacksCount}`).val()) || 3;
  const credits = $(`#${idPackOpenCredits}`).val() || GameCurrency.COINS;
  const playersHandler = $(`#${idPackPlayersAction}`).val();
  const nonPlayersHandler = $(`#${idPackNonPlayersAction}`).val();
  const duplicateHandler = $(`#${idPackDuplicatesAction}`).val();
  return {
    noOfPacks,
    playersHandler,
    nonPlayersHandler,
    duplicateHandler,
    credits,
  };
};

const buyRequiredNoOfPacks = async (pack, popUpValues) => {
  showLoader();
  while (popUpValues.noOfPacks > 0) {
    const response = await buyPack(pack, popUpValues);
    if (!response.success) {
      hideLoader();
      return sendUINotification(
        response.message || t("packOpeningErr"),
        UINotificationType.NEGATIVE
      );
    }
    await wait(3);
    popUpValues.noOfPacks--;
    sendUINotification(`${popUpValues.noOfPacks} ${t("packsRemaining")}`);
  }
  hideLoader();
};

const handleNonDuplicatePlayers = (items, action) => {
  const nonDuplicatePlayersItems = items.filter(
    (item) => !item.isDuplicate() && item.isPlayer()
  );
  sendUINotification(t("handlingNonDuplicatePlayers"));
  return handleItems(nonDuplicatePlayersItems, action);
};

const handleNonDuplicateNonPlayers = (items, action) => {
  const nonDuplicateNonPlayersItems = items.filter(
    (item) => !item.isDuplicate() && !item.isPlayer()
  );
  sendUINotification(t("handlingNonDuplicateNonPlayers"));
  return handleItems(nonDuplicateNonPlayersItems, action);
};

const handleDuplicates = (items, action) => {
  const duplicateItems = items.filter((item) => item.isDuplicate());
  sendUINotification(t("handlingDuplicates"));
  return handleItems(duplicateItems, action);
};

const handleMiscItems = (items) => {
  return new Promise(async (resolve) => {
    const miscItems = items.filter((item) => item.isMiscItem());
    if (miscItems.length) {
      sendUINotification(t("handlingCredits"));
      await Promise.all(
        miscItems.map(async (credit) => {
          services.Item.redeem(credit);
          await wait(2);
        })
      );
      resolve("");
    } else {
      resolve("");
    }
  });
};

const handleItems = (items, action) => {
  return new Promise(async (resolve) => {
    if (!items.length) {
      resolve("");
    }
    if (action === "moveTransfers" || action === "listExternal") {
      if (repositories.Item.isPileFull(ItemPile.TRANSFER)) {
        return resolve(t("transferListFull"));
      }
      if (action === "listExternal") {
        const { idQuicksellWorthlessBronze } = getValue("EnhancerSettings") || false;
        if(idQuicksellWorthlessBronze){
          let quickSellItems = [];
          let listItems = [];
          let prices = await fetchPrices(items);
          for (let itm of items){
            // THERE IS A POSIBILITY DUPLICATE NON PLAYERS GET TO LIST FUTBIN. WE CHECK IT HERE
            if(!itm.isPlayer()){
              quickSellItems.push(itm);
            }
            // WE QUICKSELL ONES THAT DOES NOT HAVE DEF ID CANT BE FOUND IN FUTBIN
            if (!itm.definitionId) {
              quickSellItems.push(itm);
            }else {
              let itemPrice = '';
              for (let price of prices){
                if(price[0] === `${itm.definitionId}_futbin_price`) itemPrice = price[1];
              }
  
              // Rare flags are different on totw and libertadores and bronze rare. We know that bronze common flag is 0
              if(itemPrice === 200 && itm.rareflag === 0){
                quickSellItems.push(itm);
              }
              else{
                listItems.push(itm);
              }
            }
          }
  
          if(listItems.length > 0){
            await listCards(listItems);
            showLoader();
          }
          
          if(quickSellItems.length > 0){
            services.Item.discard(quickSellItems);
          }
        
          resolve("");
        } else {
          await listCards(items);
          showLoader();
          resolve("");
        }
        
      } else {
        services.Item.move(items, ItemPile.TRANSFER).observe(
          this,
          function (sender, data) {
            resolve("");
          }
        );
      }
    } else if (action === "moveClub") {
      services.Item.move(items, ItemPile.CLUB).observe(
        this,
        function (sender, data) {
          resolve("");
        }
      );
    } else if (action === "quickSell") {
      services.Item.discard(items).observe(this, function (sender, data) {
        resolve("");
      });
    }
  });
};

const buyPack = (pack, popUpValues) => {
  if (repositories.Item.numItemsInCache(ItemPile.PURCHASED)) {
    return {
      success: false,
      message: services.Localization.localize(
        "popup.error.unassignedItemsEntitlementTitle"
      ),
    };
  }

  if (
    !pack.prices._collection[popUpValues.credits] ||
    pack.prices._collection[popUpValues.credits].amount >
      services.User.getUser()[popUpValues.credits.toLowerCase()].amount
  ) {
    return {
      success: false,
      message: t("errInsufficientCredits"),
    };
  }
  return new Promise((resolve) => {
    pack.purchase(popUpValues.credits).observe(this, function (sender, data) {
      if (data.success) {
        repositories.Item.setDirty(ItemPile.PURCHASED);
        sendPinEvents("Unassigned Items - List View");
        services.Item.requestUnassignedItems().observe(
          this,
          async function (sender, { response: { items } }) {
            let response = "";
            response += await handleNonDuplicatePlayers(
              items,
              popUpValues.playersHandler
            );
            await wait(2);
            response += await handleNonDuplicateNonPlayers(
              items,
              popUpValues.nonPlayersHandler
            );
            await wait(2);
            response += await handleDuplicates(
              items,
              popUpValues.duplicateHandler
            );
            await wait(2);
            response += await handleMiscItems(items);
            await wait(1);
            await updateUserCredits();
            resolve({ success: !response.length, message: response });
          }
        );
      } else {
        resolve({ success: false });
      }
    });
  });
};
