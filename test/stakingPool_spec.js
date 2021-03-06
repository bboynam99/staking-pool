// /*global contract, config, it, assert, artifacts*/
let StakingPool = artifacts.require('StakingPool');
const SNT = artifacts.require('SNT');

let iuri, jonathan, richard;

// For documentation please see https://embark.status.im/docs/contracts_testing.html
config({
  contracts: {
    deploy:
      {
        "MiniMeToken": {"deploy": false},
        "MiniMeTokenFactory": {},
        "SNT": {
          "instanceOf": "MiniMeToken",
          "args": [
            "$MiniMeTokenFactory",
            "0x0000000000000000000000000000000000000000",
            0,
            "TestMiniMeToken",
            18,
            "STT",
            true
          ]
        },
        "StakingPool": {
          "deploy": false,
          "args": ["$SNT"]
        }
      }
  }
}, (_err, accounts) => {
  iuri = accounts[0];
  jonathan = accounts[1];
  richard = accounts[2];
  pascal = accounts[3];
  michael = accounts[4];
  eric = accounts[5];
});

// TODO: add asserts for balances

contract("StakingPool", function () {
  this.timeout(0);

  before(async () => {
    // distribute SNT
    await SNT.methods.generateTokens(iuri, "10000000000000000000000").send({from: iuri});
    await SNT.methods.transfer(jonathan, "1000000000000000000000").send({from: iuri});
    await SNT.methods.transfer(richard, "1000000000000000000000").send({from: iuri});
  
    await SNT.methods.generateTokens(pascal, "1000000000000000000").send({from: iuri});
    await SNT.methods.generateTokens(michael, "1000000000000000000").send({from: iuri});

    // Deploy Staking Pool
    StakingPool = await StakingPool.deploy({ arguments: [SNT.options.address, 100] }).send();

    // approve StakingPool to transfer tokens
    let balance;
    balance = await SNT.methods.balanceOf(iuri).call();
    assert.strictEqual(balance, "8000000000000000000000");
    // TODO: we are not approving here because we want to test the approveAndCall functionality

    balance = await SNT.methods.balanceOf(jonathan).call();
    assert.strictEqual(balance, "1000000000000000000000");
    await SNT.methods.approve(StakingPool.options.address, "10000000000000000000000").send({from: jonathan});

    balance = await SNT.methods.balanceOf(richard).call();
    assert.strictEqual(balance, "1000000000000000000000");
    await SNT.methods.approve(StakingPool.options.address, "10000000000000000000000").send({from: richard});

    
  })

  describe("initial state", () => {
    it("initial exchangeRate should be 1", async function () {
      let rate = await StakingPool.methods.exchangeRate(0).call();
      assert.strictEqual(rate, "1000000000000000000");
    });

    it("initial token supply should be 0", async function () {
      let rate = await StakingPool.methods.totalSupply().call();
      assert.strictEqual(rate, "0");
    });

    it("initial balance should be 0", async function () {
      let balance = await SNT.methods.balanceOf(StakingPool.options.address).call();
      assert.strictEqual(balance, "0");
    });
  })

  describe("depositing before contributions", () => {
    before("deposit 11 ETH", async () => {
      // Deposit using approveAndCall
      const encodedCall = StakingPool.methods.stake("11000000000000000000").encodeABI();
      await SNT.methods.approveAndCall(StakingPool.options.address, "11000000000000000000", encodedCall).send({from: iuri});
    })

    it("exchangeRate should remain 1", async function () {
      let rate = await StakingPool.methods.exchangeRate(0).call();
      assert.strictEqual(rate, "1000000000000000000");
    });

    it("token supply should be 12", async function () {
      let rate = await StakingPool.methods.totalSupply().call();
      assert.strictEqual(rate, "11000000000000000000");
    });

    it("balance should be 12", async function () {
      let balance = await SNT.methods.balanceOf(StakingPool.options.address).call();
      assert.strictEqual(balance, "11000000000000000000");
    });
  });

  describe("2nd person depositing before contributions", () => {
    before("deposit 5 ETH", async () => {
      await StakingPool.methods.stake("5000000000000000000").send({from: jonathan})
    })

    it("exchangeRate should remain 1", async function () {
      let rate = await StakingPool.methods.exchangeRate(0).call();
      assert.strictEqual(rate, "1000000000000000000");
    });

    it("token supply should be 17", async function () {
      let rate = await StakingPool.methods.totalSupply().call();
      assert.strictEqual(rate, "16000000000000000000");
    });

    it("balance should be 17", async function () {
      let balance = await SNT.methods.balanceOf(StakingPool.options.address).call();
      assert.strictEqual(balance, "16000000000000000000");
    });
  });

  describe("contributions", () => {
    before("contribute 10 ETH", async () => {
      await SNT.methods.transfer(StakingPool.options.address, "10000000000000000000").send({from: iuri});
    })

    it("exchangeRate should increase", async function () {
      let rate = await StakingPool.methods.exchangeRate(0).call();
      assert.strictEqual(rate, "1625000000000000000");
    });

    it("token supply should remain at 17", async function () {
      let rate = await StakingPool.methods.totalSupply().call();
      assert.strictEqual(rate, "16000000000000000000");
    });

    it("balance should be 27", async function () {
      let balance = await SNT.methods.balanceOf(StakingPool.options.address).call();
      assert.strictEqual(balance, "26000000000000000000");
    });
  });

  describe("withdrawing 5 tokens after contributions", () => {
    before("withdraw 5 tokens", async () => {
      await StakingPool.methods.withdraw("5000000000000000000").send({from: jonathan})
    })

    it("exchangeRate should remain the same", async function () {
      let rate = await StakingPool.methods.exchangeRate(0).call();
      assert.strictEqual(rate, "1625000000000000000");
    });

    it("token supply should decrease to 11", async function () {
      let rate = await StakingPool.methods.totalSupply().call();
      assert.strictEqual(rate, "11000000000000000000");
    });

    it("balance should decrease by correct exchange rate", async function () {
      let balance = await SNT.methods.balanceOf(StakingPool.options.address).call();
      // 5000000000000000000 tokens x 1.625 rate
      // => 8125000000000000000 ETH
      // 26000000000000000000 - 8125000000000000000 = 17875000000000000000
      assert.strictEqual(balance, "17875000000000000000");
    });
  });

  describe("depositing after contributions", () => {
    before("deposit 8 ETH", async () => {
      await StakingPool.methods.stake("8000000000000000000").send({from: richard})
    })

    it("exchangeRate should remain the same", async function () {
      let rate = await StakingPool.methods.exchangeRate(0).call();
      assert.strictEqual(rate, "1625000000000000000");
    });

    it("token supply should increase by correct exchange rate", async function () {
      let rate = await StakingPool.methods.totalSupply().call();
      assert.strictEqual(rate, "15923076923076923077");
    });

    it("balance should increase", async function () {
      let balance = await SNT.methods.balanceOf(StakingPool.options.address).call();
      // 17875000000000000000 + 8000000000000000000
      assert.strictEqual(balance, "25875000000000000000");
    });
  });

  describe("Checking stake conditions", () => {

    it("should not allow stakeing more than the balance had at the moment of staking pool deployment", async () => {
      await SNT.methods.transfer(pascal, "1000000000000000000").send({from: iuri}); // Pascal now has 2 eth
      await SNT.methods.approve(StakingPool.options.address, "2000000000000000000").send({from: pascal});
      await assert.reverts(StakingPool.methods.stake("2000000000000000000"), {from: pascal}, "Returned error: VM Exception while processing transaction: revert Stake amount exceeds SNT balance at pool creation");
      await StakingPool.methods.stake("1000000000000000000").send({from: pascal});
    });

    it("should allow stake only after a pool user withdraws", async () => {
      // Mine 100 blocks
      for(let i = 0; i < 100; i++){
        await mineAtTimestamp(12345678);
      }

      await SNT.methods.approve(StakingPool.options.address, "1000000000000000000").send({from: michael});
      await assert.reverts(StakingPool.methods.stake("1000000000000000000"), {from: michael}, "Returned error: VM Exception while processing transaction: revert Max stake amount exceeded");

      assert.strictEqual(await StakingPool.methods.maxAmountToStake().call(), "0");

      await StakingPool.methods.withdraw("1000000000000000000").send({from: richard})

      assert.strictEqual(await StakingPool.methods.maxAmountToStake().call(), "1000000000000000000");

      await SNT.methods.transfer(eric, "1000000000000000000").send({from: michael});
      await SNT.methods.approve(StakingPool.options.address, "1000000000000000000").send({from: eric});
      await StakingPool.methods.stake("1000000000000000000").send({from: eric});
    });
  });

});
