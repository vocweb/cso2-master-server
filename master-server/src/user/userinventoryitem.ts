export class UserInventoryItem {
    public item_id: number
    public ammount: number

    constructor(itemId: number, ammount = 1) {
        this.item_id = itemId
        this.ammount = ammount
    }
}
