const { handleServerError } = require("./error");

const Order = require("../models/order");
const Product = require("../models/product");
const User = require("../models/user");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const stripe = require("stripe")(process.env.STRIPE_API_KEY)

const ITEMS_PER_PAGE = 2;

exports.getIndex = (req, res, next) => {
  // Product.findAll()
  const page = +req.query.page || 1;
  let totalItems;

  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      res.render("shop/products", {
        docTitle: "Shop",
        path: "/",
        products,
        hasProducts: products.length > 0,
        activeShop: true,
        shopCSS: true,
        totalProducts: totalItems,
        hasNextPage: ITEMS_PER_PAGE * page < totalItems,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
        currentPage: page,
      });
    })
    .catch((err) => handleServerError(err, next));
};

exports.getProducts = (req, res, next) => {
  // req.user
  //   .getProducts()
  const page = +req.query.page || 1;
  let totalItems;
  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      // console.table(products);
      res.render("shop/products", {
        docTitle: "Products",
        path: "/products",
        products,
        hasProducts: products.length > 0,
        activeShop: true,
        shopCSS: true,
        totalProducts: totalItems,
        hasNextPage: ITEMS_PER_PAGE * page < totalItems,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
        currentPage: page,
      });
    })
    .catch((err) => {
      handleServerError(err, next);
    });
};

exports.getCart = (req, res, next) => {
  req.user.populate("cart.items.productId").then((user) => {
    res.render("shop/cart", {
      docTitle: "My Cart",
      path: "/cart",
      products: user.cart.items.map((item) => {
        return {
          quantity: item.quantity,
          ...item.productId._doc,
        };
      }),
      totalPrice: user.cart.totalPrice,
    });
  });
  // Product.find()
  //   .then((products) => {

  //   })
  //   .catch((err) => {
  //     console.log(err);
  //   });
};

exports.postCart = (req, res, next) => {
  const { productId } = req.body;

  Product.findById(productId)
    .then((product) => {
      // const user = new User(
      //   req.user._id,
      //   req.user.username,
      //   req.user.email,
      //   req.user.cart || { items: [], totalPrice: 0 }
      // );

      return req.user.addToCart(product);
    })
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      handleServerError(err, next);
    });
};

exports.postRemoveCartItem = (req, res, next) => {
  const { productId } = req.body;

  req.user
    .removeFromCart(productId)
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      handleServerError(err, next);
    });
};

exports.getCheckout = (req, res, next) => {
  let fetchedUser;
  let products;
  let totalPrice;
  req.user
    .populate("cart.items.productId")
    .then((user) => {
      products = user.cart.items.map((item) => {
        return {
          quantity: item.quantity,
          ...item.productId._doc,
        };
      });
      totalPrice = user.cart.totalPrice
      return stripe.checkout.sessions.create({
        payment_method_types:["card"],
        line_items: products.map(prod=>{
          return {
            name: prod.title,
            description: prod.description,
            amount:prod.price*100,
            currency:'usd',
            quantity:prod.quantity,
          }
        }),
        success_url:req.protocol + "://"+req.get("host")+"/checkout/success",
        cancel_url:req.protocol + "://"+req.get("host")+"/checkout/cancel",
      });
      
    }).then((session)=>{
      res.render("shop/checkout", {
        docTitle: "Checkout",
        path: "/checkout",
        products ,
        totalPrice ,
        sessionId:session.id
      });
    })
    .catch((err) => {
      next(err);
    });
  
};

exports.getOrders = (req, res, next) => {
  Order.find({ userId: req.user._id })
    .then((orders) => {
      res.render("shop/orders", {
        docTitle: "My Orders",
        path: "/orders",
        orders,
      });
    })
    .catch((err) => {
      handleServerError(err, next);
    });
};

exports.getCheckoutSuccess = (req, res, next) => {
  let items;
  req.user
    .populate("cart.items.productId")
    .then((user) => {
      items = user.cart.items.map((item) => {
        return {
          quantity: item.quantity,
          ...item.productId._doc,
        };
      });
      console.log(items);

      const order = new Order({ userId: user._id, items });

      return order.save();
    })
    .then((result) => {
      return req.user.clearCart();
    })
    .then((result) => {
      res.redirect("/orders");
    })
    .catch((err) => {
      handleServerError(err, next);
    });
};

exports.getProductDetails = (req, res, next) => {
  const { productId } = req.params;
  Product.findById(productId)
    .then((product) => {
      res.render("shop/product-details", {
        docTitle: product.title,
        path: "/",
        product,
      });
    })
    .catch((err) => {
      handleServerError(err, next);
    });
};

exports.getInvoice = (req, res, next) => {
  const { orderId } = req.params;

  Order.findOne({ _id: orderId })
    .then((order) => {
      if (!order) {
        return next(new Error("No order found."));
      } else if (order.userId.toString() === req.user._id.toString()) {
        // fs.readFile(pathName,(err,data)=>{
        //   if (err) {
        //     return next(err);
        //   }
        //   res.set({
        //     "Content-Type":"application/pdf",
        //     'Content-Disposition':'inline; filename="'+invoiceName+'"'
        //   });
        //   res.send(data);
        //  })
        const invoiceName = "invoice-" + orderId + ".pdf";
        const pathName = path.join("data", "invoices", invoiceName);
        const pdfDoc = new PDFDocument();
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="' + invoiceName + '"',
        });
        pdfDoc.pipe(fs.createWriteStream(pathName));
        pdfDoc.pipe(res);

        pdfDoc.fontSize(24).text("Invoice", {
          underline: true,
          align: "center",
        });

        // pdfDoc.text("Title    Quantity    Price")
        let totalPrice = 0;
        order.items.forEach((prod) => {
          totalPrice += prod.price * prod.quantity;
          pdfDoc
            .fontSize(14)
            .text(`${prod.title}    x${prod.quantity}    $${prod.price}`);
        });
        pdfDoc.text("___");
        pdfDoc
          .fontSize(16)
          .fillColor("#333")
          .text("Total: $" + totalPrice);
        pdfDoc.end();
        // const file = fs.createReadStream(pathName);

        // file.pipe(res);
      } else {
        return next(new Error("Unauthorized"));
      }
    })
    .catch((err) => {
      next(err);
    });
};
