console.log("ALCHEMY_API_KEY:", process.env.ALCHEMY_API_KEY);
async function main() {
    const deployer = await ethers.getSigner(process.env.ACCOUNT);

    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const flashloanContract = await ethers.getContractFactory("Flashloan");
  const contract = await flashloanContract.deploy("0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e");

    console.log("Contract address:", contract.address);
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });